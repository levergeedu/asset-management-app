const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

const DATA_FOLDER = path.join(__dirname, 'data');
const UPLOAD_FOLDER = path.join(__dirname, 'uploads');
const SHEET_FOLDER = path.join(UPLOAD_FOLDER, 'sheets');
const ALLOCATED_FILE = path.join(DATA_FOLDER, 'allocatedAssets.json');
const UPLOADED_FILE = path.join(DATA_FOLDER, 'uploadedAssets.json');

// Ensure folders exist
[DATA_FOLDER, UPLOAD_FOLDER, SHEET_FOLDER].forEach(folder => {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

const upload = multer({ dest: 'temp/' });

// ✅ Upload asset sheet and store parsed content
app.post('/upload-assets', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const workbook = XLSX.readFile(req.file.path);
    const timestamp = new Date().toISOString();

    const allParsed = [];

    workbook.SheetNames.forEach(sheetName => {
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      jsonData.forEach(row => {
        row["Sheet Name"] = sheetName;
        row["Uploaded At"] = timestamp;
      });

      // Save parsed sheet as standalone .xlsx file
      const outputPath = path.join(SHEET_FOLDER, `${sheetName}.xlsx`);
      const newSheet = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(newSheet, XLSX.utils.json_to_sheet(jsonData), sheetName);
      XLSX.writeFile(newSheet, outputPath);

      allParsed.push(...jsonData);
    });

    // Save all parsed data to uploadedAssets.json
    fs.writeFileSync(UPLOADED_FILE, JSON.stringify(allParsed, null, 2));

    fs.unlinkSync(req.file.path); // cleanup uploaded file
    res.status(200).json({ message: '✅ Upload successful', sheets: workbook.SheetNames });
  } catch (err) {
    console.error('❌ Error during upload:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ✅ Preview parsed uploaded data
app.get('/preview-uploaded-assets', (req, res) => {
  try {
    if (!fs.existsSync(UPLOADED_FILE)) return res.json([]);
    const data = JSON.parse(fs.readFileSync(UPLOADED_FILE, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Preview failed' });
  }
});

// ✅ Download specific sheet
app.get('/download-sheet/:sheetName', (req, res) => {
  const { sheetName } = req.params;
  const filePath = path.join(SHEET_FOLDER, `${sheetName}.xlsx`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Sheet not found');
  }

  res.sendFile(filePath);
});

// ✅ Allocation endpoint (untouched)
app.post('/allocate', (req, res) => {
  const newEntry = req.body;
  const required = ['name', 'empCode', 'department', 'uniqueId', 'assetType', 'onboardingDate'];
  const missing = required.filter(k => !newEntry[k]);

  if (missing.length > 0) {
    return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
  }

  let data = [];
  if (fs.existsSync(ALLOCATED_FILE)) {
    data = JSON.parse(fs.readFileSync(ALLOCATED_FILE, 'utf8') || '[]');
  }

  data.push(newEntry);
  fs.writeFileSync(ALLOCATED_FILE, JSON.stringify(data, null, 2));
  res.status(200).json({ message: '✅ Asset allocated successfully' });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
