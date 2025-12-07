const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');
const { protect } = require('../middleware/authMiddleware');

router.get('/popular', contentController.getPopular);

router.get('/search/unified', protect, contentController.searchContent);

router.get('/:type/:id', protect, contentController.getContentDetails);

module.exports = router;