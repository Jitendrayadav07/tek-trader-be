const fs = require('fs');

const deleteImagesAfterDelay = (imagesToDelete) => {
    setTimeout(() => {
        imagesToDelete.forEach(async (img) => {
            if (img && img.ref) { 
                try {
                    fs.unlinkSync(img.ref);
                } catch (unlinkError) {
                    console.error("Error deleting file:", unlinkError);
                }
            }
        });
    }, 3000);
};

module.exports = { deleteImagesAfterDelay };
