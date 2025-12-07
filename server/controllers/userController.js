const db = require('../config/db');

exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const query = `
            SELECT u.id, u.username, u.email, u.bio, u.avatar_url,
            (SELECT COUNT(*)::int FROM follows WHERE following_id = u.id) as "followersCount",
            (SELECT COUNT(*)::int FROM follows WHERE follower_id = u.id) as "followingCount"
            FROM users u WHERE u.id = $1
        `;
        const result = await db.query(query, [userId]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};


exports.getUserById = async (req, res) => {
    const targetId = parseInt(req.params.id);
    const myId = req.user.id;
    try {

        const query = `
            SELECT u.id, u.username, u.bio, u.avatar_url,
            (SELECT COUNT(*)::int FROM follows WHERE following_id = u.id) as "followersCount",
            (SELECT COUNT(*)::int FROM follows WHERE follower_id = u.id) as "followingCount",
            (SELECT COUNT(*)::int FROM follows WHERE follower_id = $2 AND following_id = u.id) as is_following
            FROM users u WHERE u.id = $1
        `;
        const result = await db.query(query, [targetId, myId]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

        const user = result.rows[0];
        user.is_following = user.is_following > 0;
        res.status(200).json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};


exports.getNetwork = async (req, res) => {
    const userId = req.query.userId || req.user.id;
    try {
        const followers = await db.query('SELECT u.id, u.username, u.avatar_url FROM users u JOIN follows f ON u.id = f.follower_id WHERE f.following_id = $1', [userId]);
        const following = await db.query('SELECT u.id, u.username, u.avatar_url FROM users u JOIN follows f ON u.id = f.following_id WHERE f.follower_id = $1', [userId]);
        res.status(200).json({ followers: followers.rows, following: following.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Liste çekilemedi.' });
    }
};


exports.updateProfile = async (req, res) => {
    const userId = req.user.id;
    const username = req.body.username ? req.body.username : null;
    const bio = req.body.bio ? req.body.bio : null;
    let avatarUrl = req.body.avatar_url || null;

    try {
        if (req.file) {
            const b64 = Buffer.from(req.file.buffer).toString('base64');
            avatarUrl = `data:${req.file.mimetype};base64,${b64}`;
        }
        const result = await db.query(
            'UPDATE users SET username = COALESCE($1, username), bio = COALESCE($2, bio), avatar_url = COALESCE($3, avatar_url) WHERE id = $4 RETURNING *',
            [username, bio, avatarUrl, userId]
        );
        res.status(200).json({ message: 'Profil güncellendi.', user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: 'Bu isim kullanımda.' });
        console.error(err);
        res.status(500).json({ message: 'Hata.' });
    }
};


exports.followUser = async (req, res) => {
    const { targetId } = req.body;
    const followerId = req.user.id;
    if (followerId === parseInt(targetId)) return res.status(400).json({ message: 'Kendini takip edemezsin.' });

    try {
        await db.query('INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)', [followerId, targetId]);
        res.status(200).json({ message: 'Takip edildi!' });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ message: 'Zaten takip ediyorsun.' });
        console.error(err);
        res.status(500).json({ message: 'Hata.' });
    }
};


exports.unfollowUser = async (req, res) => {
    const { targetId } = req.body;
    const followerId = req.user.id;
    try {
        await db.query('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2', [followerId, targetId]);
        res.status(200).json({ message: 'Takip bırakıldı.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hata.' });
    }
};


exports.getActivityFeed = async (req, res) => {
    const currentUserId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const targetUserId = req.query.userId ? parseInt(req.query.userId) : null;

    try {
        let queryText = '';
        let queryParams = [];

        const selectPart = `
            SELECT 
                a.id, a.user_id, u.username, u.avatar_url, 
                a.activity_type, a.content_title, a.content_poster, 
                a.content_api_id, a.content_type, a.rating, a.review_text,
                to_char(a.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at,
                
                (SELECT COUNT(*)::int FROM activity_likes WHERE activity_id = a.id) as like_count,
                EXISTS(SELECT 1 FROM activity_likes WHERE activity_id = a.id AND user_id = $1) as is_liked,
                
                -- HATA BURADAYDI: "comment_count" yerine tırnak içinde "commentCount" yazıyoruz:
                (SELECT COUNT(*)::int FROM activity_comments WHERE activity_id = a.id) as "commentCount"
                
            FROM activities a
            JOIN users u ON a.user_id = u.id
        `;

        if (targetUserId) {

            queryText = `${selectPart} WHERE a.user_id = $2 ORDER BY a.created_at DESC LIMIT $3 OFFSET $4`;
            queryParams = [currentUserId, targetUserId, limit, offset];
        } else {

            queryText = `${selectPart} 
                WHERE a.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1) OR a.user_id = $1
                ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`;
            queryParams = [currentUserId, limit, offset];
        }

        const result = await db.query(queryText, queryParams);
        res.status(200).json(result.rows);

    } catch (err) {
        console.error('Akış Hatası:', err);
        res.status(500).json({ message: 'Akış hatası.' });
    }
};

exports.toggleActivityLike = async (req, res) => {
    const userId = req.user.id;
    const { activityId } = req.body;

    try {
        const check = await db.query('SELECT * FROM activity_likes WHERE user_id = $1 AND activity_id = $2', [userId, activityId]);

        if (check.rows.length > 0) {
            await db.query('DELETE FROM activity_likes WHERE user_id = $1 AND activity_id = $2', [userId, activityId]);
            res.status(200).json({ liked: false });
        } else {
            await db.query('INSERT INTO activity_likes (user_id, activity_id) VALUES ($1, $2)', [userId, activityId]);

            const actData = await db.query('SELECT user_id, content_title FROM activities WHERE id = $1', [activityId]);

            if (actData.rows.length > 0) {
                const { user_id: ownerId, content_title } = actData.rows[0];
                const safeTitle = content_title || 'bir içerik';

                if (ownerId !== userId) {
                    const message = `"${safeTitle}" hakkındaki gönderini beğendi.`;

                    await db.query(
                        `INSERT INTO notifications (user_id, actor_id, type, message, activity_id) 
                         VALUES ($1, $2, 'like', $3, $4)`,
                        [ownerId, userId, message, activityId]
                    );
                }
            }
            res.status(200).json({ liked: true });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'İşlem başarısız.' });
    }
};

exports.getActivityComments = async (req, res) => {
    const { activityId } = req.params;
    try {
        const query = `
            SELECT c.id, c.comment_text, 
            to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at,
            u.username, u.avatar_url, u.id as user_id
            FROM activity_comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.activity_id = $1
            ORDER BY c.created_at DESC
        `;
        const result = await db.query(query, [activityId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Yorumlar çekilemedi.' });
    }
};

exports.addActivityComment = async (req, res) => {
    const userId = req.user.id;
    const { activityId, text } = req.body;

    if (!text || text.trim() === '') return res.status(400).json({ message: 'Boş yorum yapılamaz.' });

    try {
        const query = `
            INSERT INTO activity_comments (activity_id, user_id, comment_text)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        const result = await db.query(query, [activityId, userId, text]);

        const actData = await db.query('SELECT user_id, content_title FROM activities WHERE id = $1', [activityId]);

        if (actData.rows.length > 0) {
            const { user_id: ownerId, content_title } = actData.rows[0];
            const safeTitle = content_title || 'bir içerik';

            if (ownerId !== userId) {
                const message = `"${safeTitle}" hakkındaki gönderine yorum yaptı.`;

                await db.query(
                    `INSERT INTO notifications (user_id, actor_id, type, message, activity_id) 
                     VALUES ($1, $2, 'comment', $3, $4)`,
                    [ownerId, userId, message, activityId]
                );
            }
        }
      

            res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Yorum yapılamadı.' });
    }
};


exports.getNotifications = async (req, res) => {
    const userId = req.user.id;
    try {
        const query = `
            SELECT n.id, n.message, n.is_read, n.type, n.created_at, n.activity_id,
                   u.username as actor_name, u.avatar_url as actor_avatar
            FROM notifications n
            JOIN users u ON n.actor_id = u.id
            WHERE n.user_id = $1
            ORDER BY n.created_at DESC
            LIMIT 20
        `;
        const result = await db.query(query, [userId]);


        const countQuery = `SELECT COUNT(*)::int FROM notifications WHERE user_id = $1 AND is_read = false`;
        const countRes = await db.query(countQuery, [userId]);

        res.status(200).json({
            notifications: result.rows,
            unreadCount: countRes.rows[0].count
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hata.' });
    }
};


exports.markNotificationsRead = async (req, res) => {
    const userId = req.user.id;
    try {
        await db.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [userId]);
        res.status(200).json({ message: 'Okundu.' });
    } catch (err) {
        res.status(500).json({ message: 'Hata.' });
    }
};