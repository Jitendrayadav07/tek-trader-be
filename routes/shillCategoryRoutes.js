const express = require("express");
const router = express.Router();

const shillCategoryController = require("../controllers/shillCategoryController");
const JoiMiddleWare = require('../middlewares/joi/joiMiddleware'); 
const shillCategoryValidation = require("../validations/shillCategoryValidation");

router.post("/create-shill-category", 
JoiMiddleWare(shillCategoryValidation.createShillCategory, 'body'),
shillCategoryController.createShillCategory);

router.get("/", shillCategoryController.getShillCategories);

router.get("/:id", 
JoiMiddleWare(shillCategoryValidation.getShillCategory, 'params'),
shillCategoryController.getShillCategorieById);

router.put("/:id",
shillCategoryController.updateShillCategory);

router.delete("/:id", 
JoiMiddleWare(shillCategoryValidation.deleteShillCategory, 'params'),
shillCategoryController.deleteShillCategory);


module.exports = router;