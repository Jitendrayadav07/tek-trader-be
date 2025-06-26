const CompressFile = require('../classes/compressFile');
const gcpUpload = require('../classes/gcpUpload');
const { deleteImagesAfterDelay } = require('../classes/deleteImagesAfterDelay');
const fs = require('fs');
require('dotenv').config();

async function handleLogoUpload(media) {
    let logo_url = null;
    let imagesToDelete = [];
  
    if (media) {
      const compressed = new CompressFile(media);
      const image_upload = await compressed.image();
      const gcp = new gcpUpload(media, image_upload, process.env.GCP_BUCKET_NAME, 1);
      const uploaded_url = await gcp.imageUploadToGcp();
  
      imagesToDelete.push(image_upload); // or image_upload.path if needed
      deleteImagesAfterDelay(imagesToDelete);
  
      logo_url = uploaded_url;
    }
  
    return logo_url;
  }
  
module.exports = { handleLogoUpload };
