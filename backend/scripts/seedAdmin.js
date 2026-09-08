import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../app/models/admin.js';

dotenv.config();

const DIRECT_MONGO_URI = 'mongodb://prachi:7694900512@ac-dpcwywl-shard-00-00.nd3xlri.mongodb.net:27017,ac-dpcwywl-shard-00-01.nd3xlri.mongodb.net:27017,ac-dpcwywl-shard-00-02.nd3xlri.mongodb.net:27017/SunGguard?ssl=true&authSource=admin&replicaSet=atlas-3rnco6-shard-0&retryWrites=true&w=majority';

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri && !DIRECT_MONGO_URI) {
      throw new Error('MONGO_URI environment variable is not defined');
    }

    try {
      await mongoose.connect(mongoUri || DIRECT_MONGO_URI);
    } catch (connErr) {
      if (connErr.message && connErr.message.includes('EBADRESP')) {
        console.log('SRV resolution failed (EBADRESP), connecting via direct replica set hosts...');
        await mongoose.connect(DIRECT_MONGO_URI);
      } else {
        throw connErr;
      }
    }
    console.log('✓ Connected to MongoDB');

    // Admin details
    const adminData = {
      name: process.env.ADMIN_SEED_NAME || 'Super Admin',
      email: process.env.ADMIN_SEED_EMAIL || 'superadmin@gmail.com',
      password: process.env.ADMIN_SEED_PASSWORD || 'password123',
      role: 'admin',
      isVerified: true,
    };

    // Create or update the admin so the script is safe to rerun.
    const admin = await Admin.findOne({ email: adminData.email }).select('+password');

    if (admin) {
      admin.name = adminData.name;
      admin.password = adminData.password;
      admin.role = adminData.role;
      admin.isVerified = adminData.isVerified;
      await admin.save();

      console.log('✓ Admin user updated successfully!');
    } else {
      const createdAdmin = new Admin(adminData);
      await createdAdmin.save();

      console.log('✓ Admin user created successfully!');
    }

    console.log('Email:', adminData.email);
    console.log('Password:', adminData.password);
    console.log('Name:', adminData.name);
    console.log('Role:', adminData.role);

    process.exit(0);
  } catch (error) {
    console.error('✗ Error seeding admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();
