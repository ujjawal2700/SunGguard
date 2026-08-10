import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './app/models/order.js';
import { geocodeAddress } from './app/services/mapsGeocodeService.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const orderId = 'ORD-01KVWR3615REJJGNVN39ATD69X';
    const order = await Order.findOne({ orderId }).lean();
    if (order) {
      const query = [
        order.address?.address,
        order.address?.landmark,
        order.address?.city
      ].filter(Boolean).join(', ');
      
      console.log('Query string for geocoding:', query);
      try {
        const result = await geocodeAddress(query);
        console.log('Geocoding result:', result);
      } catch (err) {
        console.error('Geocoding failed:', err.message);
      }
    } else {
      console.log('Order not found');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
