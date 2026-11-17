const { notificationColumns } = require('../services/notifications');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function readPositiveInteger(value) {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return null;
    }

    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function registerNotificationRoutes(app, pool, authenticateUser) {
    app.get('/api/notifications/unread-count', authenticateUser, async (req, res, next) => {
        try {
            const result = await pool.query(
                `SELECT COUNT(*) AS count
                 FROM notifications
                 WHERE user_id = $1 AND read_at IS NULL AND dismissed_at IS NULL`,
                [req.user.id]
            );
            res.json({ count: Number(result.rows[0].count) });
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/notifications', authenticateUser, async (req, res, next) => {
        const requestedLimit = req.query.limit;
        const limit = requestedLimit === undefined
            ? DEFAULT_LIMIT
            : readPositiveInteger(requestedLimit);
        const beforeId = req.query.beforeId === undefined
            ? null
            : readPositiveInteger(req.query.beforeId);

        if (limit === null || limit > MAX_LIMIT || (req.query.beforeId !== undefined && beforeId === null)) {
            return res.status(400).json({
                message: `limit must be 1-${MAX_LIMIT} and beforeId must be a positive integer.`
            });
        }

        const parameters = [req.user.id];
        let beforeClause = '';
        if (beforeId !== null) {
            parameters.push(beforeId);
            beforeClause = 'AND id < $2';
        }
        parameters.push(limit + 1);

        try {
            const result = await pool.query(
                `SELECT ${notificationColumns}
                 FROM notifications
                 WHERE user_id = $1 AND dismissed_at IS NULL ${beforeClause}
                 ORDER BY id DESC
                 LIMIT $${parameters.length}`,
                parameters
            );
            const hasMore = result.rows.length > limit;
            const notifications = result.rows.slice(0, limit);
            res.json({
                notifications,
                nextBeforeId: hasMore ? notifications[notifications.length - 1].id : null
            });
        } catch (error) {
            next(error);
        }
    });

    app.patch('/api/notifications/read-all', authenticateUser, async (req, res, next) => {
        try {
            const result = await pool.query(
                `UPDATE notifications
                 SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                 WHERE user_id = $1 AND read_at IS NULL`,
                [req.user.id]
            );
            res.json({
                message: 'All notifications marked as read.',
                updatedCount: result.rowCount
            });
        } catch (error) {
            next(error);
        }
    });

    app.patch('/api/notifications/:id/read', authenticateUser, async (req, res, next) => {
        const id = readPositiveInteger(req.params.id);
        if (id === null) {
            return res.status(400).json({ message: 'Invalid notification ID.' });
        }

        try {
            const result = await pool.query(
                `UPDATE notifications
                 SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                 WHERE id = $1 AND user_id = $2
                 RETURNING ${notificationColumns}`,
                [id, req.user.id]
            );
            if (!result.rowCount) {
                return res.status(404).json({ message: 'Notification not found.' });
            }
            res.json({ notification: result.rows[0] });
        } catch (error) {
            next(error);
        }
    });

    app.patch('/api/notifications/:id/dismiss', authenticateUser, async (req, res, next) => {
        const id = readPositiveInteger(req.params.id);
        if (id === null) {
            return res.status(400).json({ message: 'Invalid notification ID.' });
        }

        try {
            const result = await pool.query(
                `UPDATE notifications
                 SET dismissed_at = COALESCE(dismissed_at, CURRENT_TIMESTAMP)
                 WHERE id = $1 AND user_id = $2
                 RETURNING ${notificationColumns}`,
                [id, req.user.id]
            );
            if (!result.rowCount) {
                return res.status(404).json({ message: 'Notification not found.' });
            }
            res.json({ notification: result.rows[0] });
        } catch (error) {
            next(error);
        }
    });
}

module.exports = { registerNotificationRoutes };
