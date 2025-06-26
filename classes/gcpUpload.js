const { GcsFileUpload } = require('gcs-file-upload')
const path = require('path')
const fs = require('fs');
require('dotenv').config();


class gcpUpload {
    constructor(uploadImage, compressedImage, bucketName, userID) {
        this.uploadImage = uploadImage ? uploadImage : null;
        this.compressedImage = compressedImage ? compressedImage : null;
        this.bucketName = bucketName ? bucketName : null;
        this.userID = userID;
    }

    async imageUploadToGcp() {
        if (!this.uploadImage || !this.compressedImage) {
            throw new Error('Invalid image data');
        }

        let myFile = fs.readFileSync(this.compressedImage.ref)
        let timestamp = Date.now();
        let fileExtension = this.uploadImage.originalFilename.split('.').pop();
        let fileNameWithTimestamp = `${this.uploadImage.originalFilename.split('.')[0]}_${timestamp}_${this.userID}.${fileExtension}`;

        let fileMetaData = {
            originalname: fileNameWithTimestamp,
            buffer: myFile
        }

        let myBucket = new GcsFileUpload({
            projectId: process.env.GOOGLE_PROJECT_ID,
            credentials: {
                private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                client_id: process.env.GOOGLE_CLIENT_ID,
                auth_uri: process.env.GOOGLE_AUTH_URI,
                token_uri: process.env.GOOGLE_TOKEN_URI,
                auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
                client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL
            }
        }, this.bucketName)

        try {
            let uploadedImage = await myBucket.uploadFile(fileMetaData);
            return uploadedImage;
        } catch (err) {
            console.error("Upload error:", err);
            throw err;
        }
    }
}

module.exports = gcpUpload