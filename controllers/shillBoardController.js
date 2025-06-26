const Response = require("../classes/Response");
const db = require("../config/db.config");
const SHILL_BOARD_CONSTANTS_STATUS = require("../constants/shillBoardConstant");
const { handleLogoUpload } = require("../services/imageService");

const createShillBoard = async (req, res) => {
    try{
        let { txn_hash , contract_address , sender_address, shill_category_id ,description ,end_date_time } = req.body;

        let media;
        if (req.files && req.files.image_url) {
          media = req.files.image_url;
        } else {
          media = null;
        };

        const image_url = await handleLogoUpload(media);
        let response = await db.ShillBoard.create({txn_hash , contract_address , sender_address, shill_category_id ,image_url ,description ,end_date_time});

        return res.status(201).send(Response.sendResponse(true,response,SHILL_BOARD_CONSTANTS_STATUS.SHILL_BOARD_CREATED,201));
    }catch(err) {
        console.log("err", err);
        return res.status(500).send(Response.sendResponse(false,null,SHILL_BOARD_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}

const getShillBoards = async (req, res) => {
    try {
        let response = await db.ShillBoard.findAll();
        return res.status(200).send(Response.sendResponse(true,response,null,200));
    }catch(err){
        return res.status(500).send(Response.sendResponse(false,null,SHILL_BOARD_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}

const getShillBoardById = async (req, res) => {
    try {
        let response = await db.ShillBoard.findOne({where: {id: req.params.id}});
        return res.status(200).send(Response.sendResponse(true,response,null,200));
    }catch(err){
        return res.status(500).send(Response.sendResponse(false,null,SHILL_BOARD_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}

const updateShillBoard = async (req, res) => {
    try{
        const { id } = req.params;
        const { description } = req.body;
        let response = await db.ShillBoard.update(req.body, {where: {id : id}})
        return res.status(200).send(Response.sendResponse(true,response,SHILL_BOARD_CONSTANTS_STATUS.SHILL_BOARD_UPDATED,200));
    }catch(err) {
        console.log("err", err);
        return res.status(500).send(Response.sendResponse(false,null,SHILL_BOARD_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}

const deleteShillBoard = async (req, res) => {
    try{
        let response = await db.ShillBoard.destroy({where: {id : req.params.id}})
        return res.status(200).send(Response.sendResponse(true,response,SHILL_BOARD_CONSTANTS_STATUS.SHILL_BOARD_DELETED,200));
    }catch(err) {
        return res.status(500).send(Response.sendResponse(false,null,SHILL_BOARD_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}


module.exports = { 
    createShillBoard, 
    getShillBoards, 
    getShillBoardById, 
    updateShillBoard, 
    deleteShillBoard
}


