const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');
const { createNotification } = require('../services/notifications');

process.env.JWT_SECRET = 'notifications-test-only-secret';

test('notifications persist, enforce ownership, deduplicate, and share application transactions', async t => {
    let pool;
    if (process.env.TEST_DATABASE_URL) {
        const { Pool } = require('pg');
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    } else {
        const { newDb, DataType } = require('pg-mem');
        const database = newDb({ noAstCoverageCheck: true });
        database.public.registerFunction({
            name: 'trim',
            args: [DataType.text],
            returns: DataType.text,
            implementation: value => value.trim()
        });
        database.public.registerFunction({
            name: 'length',
            args: [DataType.text],
            returns: DataType.integer,
            implementation: value => [...value].length
        });
        const { Pool } = database.adapters.createPg();
        pool = new Pool();
    }

    const userIds = [];
    const jobIds = [];
    const servers = [];
    t.after(async () => {
        try {
            for (const server of servers) {
                if (server.listening) {
                    await new Promise(resolve => server.close(resolve));
                }
            }
            for (const jobId of jobIds) {
                await pool.query('DELETE FROM jobs WHERE id = $1', [jobId]);
            }
            for (const userId of userIds) {
                await pool.query('DELETE FROM users WHERE id = $1', [userId]);
            }
        } finally {
            await pool.end();
        }
    });

    await migrate(pool);

    async function addUser(suffix) {
        const result = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
            [`notifications-${Date.now()}-${suffix}@example.com`, 'test-only']
        );
        const userId = result.rows[0].id;
        userIds.push(userId);
        return userId;
    }

    async function addJob(recruiterId, isOpen = true) {
        const result = await pool.query(
            `INSERT INTO jobs
                (recruiter_id, title, company, location, category, employment_type, description, is_open)
             VALUES ($1, 'Backend Developer', 'CareerConnect Labs', 'Montreal', 'Engineering',
                     'Full-time', 'Build APIs', $2)
             RETURNING id`,
            [recruiterId, isOpen]
        );
        const jobId = result.rows[0].id;
        jobIds.push(jobId);
        return jobId;
    }

    const applicantId = await addUser('applicant');
    const secondApplicantId = await addUser('second-applicant');
    const recruiterId = await addUser('recruiter');
    const rollbackApplicantId = await addUser('rollback-applicant');
    const ownedJobId = await addJob(recruiterId);
    const unownedJobId = await addJob(null);
    const closedJobId = await addJob(recruiterId, false);
    const tokens = new Map([
        [applicantId, jwt.sign({ userId: applicantId }, process.env.JWT_SECRET, { expiresIn: '5m' })],
        [secondApplicantId, jwt.sign({ userId: secondApplicantId }, process.env.JWT_SECRET, { expiresIn: '5m' })],
        [recruiterId, jwt.sign({ userId: recruiterId }, process.env.JWT_SECRET, { expiresIn: '5m' })],
        [rollbackApplicantId, jwt.sign({ userId: rollbackApplicantId }, process.env.JWT_SECRET, { expiresIn: '5m' })]
    ]);

    async function startServer(appPool = pool) {
        const server = createApp(appPool).listen(0, '127.0.0.1');
        servers.push(server);
        await new Promise(resolve => server.once('listening', resolve));
        return `http://127.0.0.1:${server.address().port}`;
    }

    let base = await startServer();

    async function request(path, { method = 'GET', userId, body } = {}) {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: {
                ...(userId ? { Authorization: `Bearer ${tokens.get(userId)}` } : {}),
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const data = await response.json();
        return { status: response.status, data };
    }

    async function submitApplication(jobId, userId = applicantId) {
        return request('/api/applications', {
            method: 'POST',
            userId,
            body: { jobId }
        });
    }

    for (const [path, method] of [
        ['/api/notifications', 'GET'],
        ['/api/notifications/unread-count', 'GET'],
        ['/api/notifications/read-all', 'PATCH'],
        ['/api/notifications/1/read', 'PATCH'],
        ['/api/notifications/1/dismiss', 'PATCH']
    ]) {
        assert.equal((await request(path, { method })).status, 401);
    }
    const invalidTokenResponse = await fetch(`${base}/api/notifications`, {
        headers: { Authorization: 'Bearer invalid-token' }
    });
    assert.equal(invalidTokenResponse.status, 401);

    const submitted = await submitApplication(ownedJobId);
    assert.equal(submitted.status, 201);
    assert.deepEqual(Object.keys(submitted.data).sort(), ['application', 'message']);
    assert.equal(submitted.data.message, 'Application submitted successfully.');
    const applicationId = submitted.data.application.id;

    const applicantList = await request('/api/notifications', { userId: applicantId });
    assert.equal(applicantList.status, 200);
    assert.equal(applicantList.data.notifications.length, 1);
    assert.equal(applicantList.data.notifications[0].type, 'application_submitted');
    assert.equal(applicantList.data.notifications[0].applicationId, applicationId);
    assert.equal(applicantList.data.notifications[0].userId, applicantId);

    const recruiterList = await request('/api/notifications', { userId: recruiterId });
    assert.equal(recruiterList.data.notifications.length, 1);
    assert.equal(recruiterList.data.notifications[0].type, 'new_application');
    assert.equal(recruiterList.data.notifications[0].userId, recruiterId);
    assert.equal(recruiterList.data.notifications[0].actorUserId, applicantId);
    assert.equal((await request('/api/notifications/unread-count', { userId: recruiterId })).data.count, 1);
    assert.equal((await request('/api/notifications', { userId: secondApplicantId })).data.notifications.length, 0);

    const duplicate = await submitApplication(ownedJobId);
    assert.equal(duplicate.status, 409);
    assert.equal((await pool.query(
        'SELECT COUNT(*) AS count FROM notifications WHERE application_id = $1',
        [applicationId]
    )).rows[0].count * 1, 2);

    assert.equal((await submitApplication(2147483647)).status, 404);
    assert.equal((await submitApplication(closedJobId)).status, 404);
    assert.equal((await request('/api/notifications', { userId: applicantId })).data.notifications.length, 1);

    const otherUserUpdate = await request(
        `/api/notifications/${applicantList.data.notifications[0].id}/read`,
        { method: 'PATCH', userId: secondApplicantId }
    );
    assert.equal(otherUserUpdate.status, 404);
    assert.equal((await request('/api/notifications/unread-count', { userId: applicantId })).data.count, 1);

    const readOne = await request(
        `/api/notifications/${applicantList.data.notifications[0].id}/read`,
        { method: 'PATCH', userId: applicantId }
    );
    assert.equal(readOne.status, 200);
    assert.ok(readOne.data.notification.readAt);
    assert.equal((await request('/api/notifications/unread-count', { userId: applicantId })).data.count, 0);

    const unownedSubmission = await submitApplication(unownedJobId);
    assert.equal(unownedSubmission.status, 201);
    assert.equal((await request('/api/notifications', { userId: recruiterId })).data.notifications.length, 1);
    assert.equal((await request('/api/notifications/unread-count', { userId: applicantId })).data.count, 1);
    const readAll = await request('/api/notifications/read-all', { method: 'PATCH', userId: applicantId });
    assert.equal(readAll.status, 200);
    assert.equal(readAll.data.updatedCount, 1);
    assert.equal((await request('/api/notifications/unread-count', { userId: applicantId })).data.count, 0);

    const client = await pool.connect();
    let directNotification;
    try {
        await client.query('BEGIN');
        const notification = {
            userId: applicantId,
            type: 'application_status',
            title: 'Application status updated',
            message: 'Your application status changed.',
            applicationId,
            jobId: ownedJobId,
            dedupeKey: `test:status:${applicationId}`
        };
        directNotification = await createNotification(client, notification);
        const duplicateNotification = await createNotification(client, notification);
        assert.ok(directNotification);
        assert.equal(duplicateNotification, null);
        await assert.rejects(
            createNotification(client, { ...notification, dedupeKey: 'external-link', link: 'https://untrusted.example' }),
            /internal path/
        );
        assert.equal((await client.query(
            'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND dedupe_key = $2',
            [applicantId, notification.dedupeKey]
        )).rows[0].count * 1, 1);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    const dismissed = await request(
        `/api/notifications/${directNotification.id}/dismiss`,
        { method: 'PATCH', userId: applicantId }
    );
    assert.equal(dismissed.status, 200);
    assert.ok(dismissed.data.notification.dismissedAt);
    assert.equal(
        (await request('/api/notifications', { userId: applicantId })).data.notifications
            .some(notification => notification.id === directNotification.id),
        false
    );

    const rollbackPool = {
        query: (...args) => pool.query(...args),
        async connect() {
            const client = await pool.connect();
            let notificationInserts = 0;
            return {
                query(sql, parameters) {
                    if (sql === 'ROLLBACK') {
                        rollbackCalled = true;
                    }
                    if (sql.includes('INSERT INTO notifications')) {
                        notificationInserts += 1;
                        if (notificationInserts === 2) {
                            throw new Error('simulated recruiter notification write failure');
                        }
                    }
                    return client.query(sql, parameters);
                },
                release() {
                    client.release();
                }
            };
        }
    };
    let rollbackCalled = false;
    base = await startServer(rollbackPool);
    const failedSubmission = await submitApplication(ownedJobId, rollbackApplicantId);
    assert.equal(failedSubmission.status, 500);
    assert.equal(rollbackCalled, true);
       if (process.env.TEST_DATABASE_URL) {
        assert.equal(Number((await pool.query(
            'SELECT COUNT(*) AS count FROM applications WHERE user_id = $1',
            [rollbackApplicantId]
        )).rows[0].count), 0);

        assert.equal(Number((await pool.query(
            'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 OR actor_user_id = $1',
            [rollbackApplicantId]
        )).rows[0].count), 0);
    }
});
