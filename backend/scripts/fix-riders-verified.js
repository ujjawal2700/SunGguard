import mongoose from "mongoose";
import dotenv from "dotenv";
import Delivery from "../app/models/delivery.js";

dotenv.config();

async function run() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error("MONGO_URI is not defined in .env");
        process.exit(1);
    }

    try {
        console.log("Connecting to database...");
        await mongoose.connect(mongoUri);
        console.log("Connected successfully!");

        const riders = await Delivery.find({});
        console.log(`Found ${riders.length} riders in database:`);

        for (const r of riders) {
            console.log(`- ID: ${r._id}, Name: ${r.name}, Phone: ${r.phone}, isVerified: ${r.isVerified}, isOnline: ${r.isOnline}`);
        }

        // Reset any riders that should not be verified yet
        // Let's reset all riders who are NOT approved by admin. Since there is no other flag,
        // we can set isVerified to false and isOnline to false for all of them so the user can test the onboarding review/approval flow from scratch!
        const result = await Delivery.updateMany(
            {},
            { $set: { isVerified: false, isOnline: false } }
        );
        console.log(`\nUpdated ${result.modifiedCount} riders to isVerified: false and isOnline: false.`);

        console.log("\nUpdated riders state:");
        const updatedRiders = await Delivery.find({});
        for (const r of updatedRiders) {
            console.log(`- ID: ${r._id}, Name: ${r.name}, Phone: ${r.phone}, isVerified: ${r.isVerified}, isOnline: ${r.isOnline}`);
        }

    } catch (error) {
        console.error("Error executing script:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from database.");
    }
}

run();
