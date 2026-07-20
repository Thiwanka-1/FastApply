import multer from 'multer';

// Keep the file in memory as a Buffer
const storage = multer.memoryStorage();

// Accept PDF and Word Document files
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword' // .doc
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only .pdf, .doc, and .docx formats are allowed!'), false);
  }
};

// Limit file size to 5MB to prevent abuse
export const uploadDocs = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, 
});