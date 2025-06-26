const Response = require("../classes/Response");
const db = require("../config/db.config");
const SHILL_CATEGORY_CONSTANTS_STATUS = require("../constants/shillCategoryConstant");

const createShillCategory = async (req, res) => {
    try{
        let { shill_category } = req.body
        let shill_category_exist = await db.ShillCategory.findOne({where: {shill_category: shill_category}});
        if (shill_category_exist) {
            return res.status(400).send(Response.sendResponse(false, null, SHILL_CATEGORY_CONSTANTS_STATUS.SHILL_CATEGORY_NOT_FOUND, 400));
        }
        let response = await db.ShillCategory.create({shill_category : shill_category});

        return res.status(201).send(Response.sendResponse(true,response,SHILL_CATEGORY_CONSTANTS_STATUS.SHILL_CATEGORY_CREATED,201));
    }catch(err) {
        console.log("err", err);
        return res.status(500).send(Response.sendResponse(false,null,SHILL_CATEGORY_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}

const getShillCategories = async (req, res) => {
    try {
        let response = await db.ShillCategory.findAll();
        return res.status(200).send(Response.sendResponse(true,response,null,200));
    }catch(err){
        return res.status(500).send(Response.sendResponse(false,null,SHILL_CATEGORY_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}

const getShillCategorieById = async (req, res) => {
    try {
        let response = await db.ShillCategory.findOne({where: {id: req.params.id}});
        return res.status(200).send(Response.sendResponse(true,response,null,200));
    }catch(err){
        return res.status(500).send(Response.sendResponse(false,null,SHILL_CATEGORY_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}

const updateShillCategory = async (req, res) => {
    try{
        const { id } = req.params;
        const { shill_category } = req.body;
        let response = await db.ShillCategory.update(req.body, {where: {id : id}})
        return res.status(200).send(Response.sendResponse(true,response,SHILL_CATEGORY_CONSTANTS_STATUS.SHILL_CATEGORY_UPDATED,200));
    }catch(err) {
        console.log("err", err);
        return res.status(500).send(Response.sendResponse(false,null,SHILL_CATEGORY_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}

const deleteShillCategory = async (req, res) => {
    try{
        let response = await db.ShillCategory.destroy({where: {id : req.params.id}})
        return res.status(200).send(Response.sendResponse(true,response,SHILL_CATEGORY_CONSTANTS_STATUS.SHILL_CATEGORY_DELETED,200));
    }catch(err) {
        return res.status(500).send(Response.sendResponse(false,null,SHILL_CATEGORY_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}


module.exports = { 
    createShillCategory, 
    getShillCategories, 
    getShillCategorieById, 
    updateShillCategory, 
    deleteShillCategory
}


