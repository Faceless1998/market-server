const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
      console.log('Created uploads directory at:', uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.'), false);
    }
  }
});

// Serve static files from uploads directory
router.use('/uploads', express.static('uploads'));

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find()
      .populate('seller', 'name')
      .sort({ createdAt: -1 });  // Sort by newest first
    
    console.log('Found products:', JSON.stringify(products, null, 2));
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get seller's store products
router.get('/my-store', protect, async (req, res) => {
  try {
    const products = await Product.find({ 'store.id': req.user._id })  // Updated query
      .populate('seller', 'name')
      .sort({ createdAt: -1 });
    console.log('Found store products:', JSON.stringify(products, null, 2));
    res.json(products);
  } catch (error) {
    console.error('Error fetching store products:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new product
router.post('/', protect, upload.single('image'), async (req, res) => {
  try {
    console.log('Creating product, user role:', req.user.role);
    
    if (req.user.role !== 'seller') {
      return res.status(403).json({ message: 'Only sellers can create products' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image' });
    }

    console.log('Uploaded file:', req.file);
    console.log('Request body:', req.body);

    const imageUrl = `/uploads/${req.file.filename}`;

    const product = new Product({
      name: req.body.name,
      description: req.body.description,
      price: Number(req.body.price),
      image: imageUrl,
      store: {
        id: req.user._id,
        name: req.user.name || 'Unknown Seller'
      },
      seller: req.user._id
    });

    console.log('Product to save:', product);

    const savedProduct = await product.save();
    res.status(201).json(savedProduct);
  } catch (error) {
    console.error('Error creating product:', error);
    // Delete uploaded file if product creation fails
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    res.status(500).json({ 
      message: 'Error creating product',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Update a product
router.put('/:id', protect, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this product' });
    }

    const updateData = {
      name: req.body.name,
      description: req.body.description,
      price: Number(req.body.price)
    };

    if (req.file) {
      // Delete old image if it exists
      if (product.image) {
        const oldImagePath = path.join(__dirname, '..', product.image);
        fs.unlink(oldImagePath, (err) => {
          if (err) console.error('Error deleting old image:', err);
        });
      }
      updateData.image = `/uploads/${req.file.filename}`;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    // Delete uploaded file if update fails
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    res.status(500).json({ message: 'Error updating product' });
  }
});

// Delete a product
router.delete('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.store.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Delete product image if it exists
    if (product.image) {
      const imagePath = path.join(__dirname, '..', product.image.replace('/api/products', ''));
      fs.unlink(imagePath, (err) => {
        if (err) console.error('Error deleting image:', err);
      });
    }

    await product.remove();
    res.json({ message: 'Product removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 