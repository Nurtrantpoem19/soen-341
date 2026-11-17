const NOTIFICATION_TYPES = new Set([
    'application_submitted',
    'new_application',
    'application_status',
    'interview_invitation',
    'deadline_reminder'
]);

const notificationColumns = `
    id,
    user_id AS "userId",
    type,
    title,
    message,
    link,
    application_id AS "applicationId",
    job_id AS "jobId",
    actor_user_id AS "actorUserId",
    dedupe_key AS "dedupeKey",
    created_at AS "createdAt",
    read_at AS "readAt",
    dismissed_at AS "dismissedAt"`;

async function createNotification(client, notification) {
    const {
        userId,
        type,
        title,
        message,
        link = null,
        applicationId = null,
        jobId = null,
        actorUserId = null,
        dedupeKey
    } = notification;

    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw new TypeError('Notification userId must be a positive safe integer.');
    }
    if (!NOTIFICATION_TYPES.has(type)) {
        throw new TypeError('Notification type is not supported.');
    }
    if (typeof title !== 'string' || !title.trim() || title.length > 160) {
        throw new TypeError('Notification title must contain 1 to 160 characters.');
    }
    if (typeof message !== 'string' || !message.trim() || message.length > 2000) {
        throw new TypeError('Notification message must contain 1 to 2000 characters.');
    }
    if (link !== null) {
        let parsedLink;
        try {
            parsedLink = new URL(link, 'http://careerconnect.local');
        } catch (error) {
            throw new TypeError('Notification link must be an internal path.');
        }
        if (
            typeof link !== 'string' ||
            !link.startsWith('/') ||
            link.startsWith('//') ||
            link.includes('\\') ||
            parsedLink.origin !== 'http://careerconnect.local'
        ) {
            throw new TypeError('Notification link must be an internal path.');
        }
    }
    if (typeof dedupeKey !== 'string' || !dedupeKey.trim() || dedupeKey.length > 200) {
        throw new TypeError('Notification dedupeKey must contain 1 to 200 characters.');
    }

    const existing = await client.query(
        'SELECT id FROM notifications WHERE user_id = $1 AND dedupe_key = $2',
        [userId, dedupeKey]
    );
    if (existing.rowCount) {
        return null;
    }

    const result = await client.query(
        `INSERT INTO notifications
            (user_id, type, title, message, link, application_id, job_id, actor_user_id, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, dedupe_key) DO NOTHING
         RETURNING ${notificationColumns}`,
        [userId, type, title.trim(), message.trim(), link, applicationId, jobId, actorUserId, dedupeKey]
    );

    return result.rows[0] || null;
}

async function createApplicationSubmissionNotifications(client, application, recruiterId) {
    const { id, userId, jobId, jobTitle, company } = application;
    const submittedKey = `application:${id}:submitted:${userId}`;

    const applicantNotification = await createNotification(client, {
        userId,
        type: 'application_submitted',
        title: 'Application submitted',
        message: `Your application for ${jobTitle} at ${company} was submitted.`,
        link: `/frontend/job.html?id=${encodeURIComponent(jobId)}`,
        applicationId: id,
        jobId,
        dedupeKey: submittedKey
    });

    let recruiterNotification = null;
    if (recruiterId !== null && recruiterId !== undefined) {
        recruiterNotification = await createNotification(client, {
            userId: recruiterId,
            type: 'new_application',
            title: 'New application received',
            message: `A candidate applied for ${jobTitle} at ${company}.`,
            applicationId: id,
            jobId,
            actorUserId: userId,
            dedupeKey: `application:${id}:received:${recruiterId}`
        });
    }

    return { applicantNotification, recruiterNotification };
}

module.exports = {
    NOTIFICATION_TYPES,
    notificationColumns,
    createNotification,
    createApplicationSubmissionNotifications
};
