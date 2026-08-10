/**
 * MongoDB Migration Script
 * Copies all collections from `seva` → `sunGguard`
 *
 * Usage: node migrate-db.js
 */

const { MongoClient } = require("mongodb");

const SOURCE_URI =
  "mongodb+srv://prachi:7694900512@cluster0.nd3xlri.mongodb.net/seva?retryWrites=true&w=majority";

const DEST_URI =
  "mongodb+srv://prachi:7694900512@cluster0.nd3xlri.mongodb.net/sunGguard?retryWrites=true&w=majority";

async function migrate() {
  const sourceClient = new MongoClient(SOURCE_URI);
  const destClient = new MongoClient(DEST_URI);

  try {
    console.log("🔗 Connecting to source database (seva)...");
    await sourceClient.connect();
    const sourceDb = sourceClient.db("seva");

    console.log("🔗 Connecting to destination database (sunGguard)...");
    await destClient.connect();
    const destDb = destClient.db("sunGguard");

    // Get all collections from source
    const collections = await sourceDb.listCollections().toArray();
    console.log(`\n📦 Found ${collections.length} collection(s) to migrate:\n`);

    for (const collectionInfo of collections) {
      const collName = collectionInfo.name;
      const sourceCol = sourceDb.collection(collName);
      const destCol = destDb.collection(collName);

      const totalDocs = await sourceCol.countDocuments();
      console.log(`  → Migrating collection: "${collName}" (${totalDocs} documents)`);

      if (totalDocs === 0) {
        console.log(`     ⚠️  Skipping — no documents found.\n`);
        continue;
      }

      // Fetch all documents from source
      const docs = await sourceCol.find({}).toArray();

      // Drop existing destination collection to avoid duplicates
      try {
        await destCol.drop();
        console.log(`     🗑️  Dropped existing "${collName}" in destination.`);
      } catch {
        // Collection didn't exist — that's fine
      }

      // Insert into destination
      const result = await destCol.insertMany(docs, { ordered: false });
      console.log(`     ✅ Inserted ${result.insertedCount} / ${totalDocs} documents.\n`);
    }

    console.log("🎉 Migration complete! All collections copied to sunGguard.");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await sourceClient.close();
    await destClient.close();
    console.log("🔌 Connections closed.");
  }
}

migrate();
