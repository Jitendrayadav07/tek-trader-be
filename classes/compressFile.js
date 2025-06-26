const sharp = require('sharp');
const fs = require('fs');
const { promisify } = require('util');

class CompressFile {
  constructor(file) {
    this.file = file ? file : null;
  }

  async image(res) {
    try {
      let result = {};

      if (this.file.type === 'image/jpeg') {
        // Set the desired compression options for JPEG
        const compressionOptions = {
          quality: 40, // Adjust the quality value as per your requirements (0 - 100)
        };

        const ref = `${this.file.originalFilename}_${Date.now()}.jpg`;

        // Compress the JPEG image
        await sharp(this.file.path)
          .jpeg(compressionOptions)
          .toFile(ref);

        const blob = fs.readFileSync(ref);
        result.ref = ref;
        result.blob = blob;
        return result;
      } else if (this.file.type === 'image/png') {
        // Set the desired compression options for PNG
        const compressionOptions = {
          quality: 40, // Adjust the quality value as per your requirements (0 - 100)
        };

        const ref = `${this.file.originalFilename}_${Date.now()}.png`;

        // Compress the PNG image
        await sharp(this.file.path)
          .png(compressionOptions)
          .toFile(ref);

        const blob = fs.readFileSync(ref);
        result.ref = ref;
        result.blob = blob;
        return result;
      } else if (this.file.type === 'image/gif') {
        // Set the desired compression options for GIF
        const compressionOptions = {
          quality: 40, // Adjust the quality value as per your requirements (0 - 100)
        };

        const ref = `${this.file.originalFilename}_${Date.now()}.gif`;

        // Compress the GIF image
        await sharp(this.file.path)
          .gif(compressionOptions)
          .toFile(ref);

        const blob = fs.readFileSync(ref);
        result.ref = ref;
        result.blob = blob;
        return result;
      } else {
        // Unsupported image format
        throw new Error("Unsupported Image Format");
        // return res.status(400).send(Response.sendResponse(false, null, "Unsupported Image Format", 400));
      }
    } catch (err) {
      return err;
    }
  }
}

module.exports = CompressFile;
