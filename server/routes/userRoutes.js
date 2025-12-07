const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });


router.get('/profile', protect, userController.getProfile);
router.put('/profile', protect, upload.single('avatar'), userController.updateProfile);


router.get('/feed', protect, userController.getActivityFeed);
router.get('/network', protect, userController.getNetwork);

router.post('/follow', protect, userController.followUser);
router.delete('/follow', protect, userController.unfollowUser);

router.post('/activity/like', protect, userController.toggleActivityLike);

router.get('/activity/:activityId/comments', protect, userController.getActivityComments);
router.post('/activity/comment', protect, userController.addActivityComment);


router.get('/notifications', protect, userController.getNotifications);
router.put('/notifications/read', protect, userController.markNotificationsRead);



    router.get('/:id', protect, userController.getUserById);

module.exports = router;