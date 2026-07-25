const admin = require("firebase-admin");
const fs = require("fs");
const csv = require("csv-parser");

// 1. טעינת מפתח השירות
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// 2. הכנס כאן את ה-UID של המשתמש מ-Firebase Auth
const USER_UID = "yUP5nEmDQKc2XUHDUVJsAT92j8e2";

async function uploadData() {
  const results = [];

  // קריאת הקובץ data.csv
  fs.createReadStream("data.csv")
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      console.log(`Found ${results.length} rows. Starting import...`);

      const BATCH_SIZE = 400;
      let batch = db.batch();
      let count = 0;
      let totalImported = 0;

      const weightsCollectionRef = db
        .collection("users")
        .doc(USER_UID)
        .collection("weights");

      for (const row of results) {
        let dateStr = row.date ? row.date.trim() : "";
        const weightNum = parseFloat(row.weight);

        if (!dateStr || isNaN(weightNum)) {
          console.warn("Skipping invalid row:", row);
          continue;
        }

        // המרה מ-DD/MM/YYYY ל-YYYY-MM-DD לשמירה נכונה ב-Firestore
        if (dateStr.includes("/")) {
          const parts = dateStr.split("/");
          if (parts.length === 3) {
            const [day, month, year] = parts;
            dateStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
          }
        }

        const newDocRef = weightsCollectionRef.doc();
        batch.set(newDocRef, {
          date: dateStr,
          weight: weightNum,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        count++;

        if (count === BATCH_SIZE) {
          await batch.commit();
          totalImported += count;
          console.log(`Imported ${totalImported} entries...`);
          batch = db.batch();
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
        totalImported += count;
      }

      console.log(`Done! Successfully imported ${totalImported} entries.`);
      process.exit(0);
    });
}

uploadData().catch(console.error);
