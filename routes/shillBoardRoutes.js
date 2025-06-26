const express = require("express");
const router = express.Router();

const shillBoardController = require("../controllers/shillBoardController");
const JoiMiddleWare = require('../middlewares/joi/joiMiddleware'); 
const shillBoardValidation = require("../validations/shillBoardValidation");

router.post("/create-shill-board", 
JoiMiddleWare(shillBoardValidation.createShillBoard, 'body'),
shillBoardController.createShillBoard);

router.get("/", shillBoardController.getShillBoards);

router.get("/:id", 
JoiMiddleWare(shillBoardValidation.getShillBoard, 'params'),
shillBoardController.getShillBoardById);

router.put("/:id",
shillBoardController.updateShillBoard);

router.delete("/:id", 
JoiMiddleWare(shillBoardValidation.deleteShillBoard, 'params'),
shillBoardController.deleteShillBoard);


module.exports = router;