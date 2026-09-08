import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../app/models/admin.js';
import Seller from '../app/models/seller.js';

dotenv.config();

const admins = [
    { name: 'Super Admin', email: 'superadmin@gmail.com', password: 'password123' },
    { name: 'Ankit Ahirwar', email: 'ankit@appzeto.com', password: 'Admin!@#123' },
    { name: 'Harshvardhan Panchal', email: 'harshvardhanpanc145@gmail.com', password: 'Admin!@#123' }
];

const sellers = [
    { name: 'Harsh', email: 'harsh@appzeto.com', password: 'Admin!@#123', shopName: 'Appzeto Store' }
];

const DIRECT_MONGO_URI = 'mongodb://prachi:7694900512@ac-dpcwywl-shard-00-00.nd3xlri.mongodb.net:27017,ac-dpcwywl-shard-00-01.nd3xlri.mongodb.net:27017,ac-dpcwywl-shard-00-02.nd3xlri.mongodb.net:27017/SunGguard?ssl=true&authSource=admin&replicaSet=atlas-3rnco6-shard-0&retryWrites=true&w=majority';

async function seed() {
    try {
        try {
            await mongoose.connect(process.env.MONGO_URI);
        } catch (connErr) {
            if (connErr.message && connErr.message.includes('EBADRESP')) {
                console.log('SRV resolution failed (EBADRESP), connecting via direct replica set hosts...');
                await mongoose.connect(DIRECT_MONGO_URI);
            } else {
                throw connErr;
            }
        }
        console.log('Connected to MongoDB');

        for (const adminData of admins) {
            // Find existing
            let admin = await Admin.findOne({ email: adminData.email });
            if (admin) {
                admin.password = adminData.password;
                await admin.save();
                console.log(`Updated Admin: ${adminData.email}`);
            } else {
                await Admin.create({ ...adminData, role: 'admin', isVerified: true });
                console.log(`Created Admin: ${adminData.email}`);
            }
        }

        for (const sellerData of sellers) {
            let seller = await Seller.findOne({ email: sellerData.email });
            if (seller) {
                seller.password = sellerData.password;
                seller.isVerified = true;
                seller.isActive = true;
                seller.applicationStatus = 'approved';
                await seller.save();
                console.log(`Updated Seller: ${sellerData.email}`);
            } else {
                await Seller.create({ 
                    ...sellerData, 
                    role: 'seller', 
                    isVerified: true, 
                    isActive: true, 
                    applicationStatus: 'approved',
                    phone: '9999999999' 
                });
                console.log(`Created Seller: ${sellerData.email}`);
            }
        }

        console.log('Seeding completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding:', error);
        process.exit(1);
    }
}

seed();
