const express = require('express');
const router = express.Router();
const libraryController = require('../controllers/libraryController');
const { protect } = require('../middleware/authMiddleware');


router.post('/add', protect, libraryController.addToLibrary);

router.get('/', protect, libraryController.getLibrary);

router.get('/user/:id', protect, libraryController.getUserLibrary);

router.put('/:id', protect, libraryController.updateLibraryItem); 

router.post('/review', protect, libraryController.addReview);

router.post('/custom', protect, libraryController.createCustomList);       
router.get('/custom', protect, libraryController.getCustomLists);          
router.post('/custom/add', protect, libraryController.addToCustomList);    
router.get('/custom/:listId', protect, libraryController.getCustomListItems); 


router.delete('/review/:id', protect, libraryController.deleteReview);
router.delete('/custom/:id', protect, libraryController.deleteCustomList);

router.get('/custom/:listId/items', libraryController.getCustomListItems);
module.exports = router;