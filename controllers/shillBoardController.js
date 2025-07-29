const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider("https://avaxfull.blockviper.com/ext/bc/C/rpc");
const Response = require("../classes/Response");
const db = require("../config/db.config");
const SHILL_BOARD_CONSTANTS_STATUS = require("../constants/shillBoardConstant");

// Helper to get shill category id and calculate end time
async function getCategoryIdAndEndTime(shill_category_name, start_time) {
    // Fetch the shill category by name
    const category = await db.ShillCategory.findOne({ where: { shill_category: shill_category_name } });
    if (!category) {
        throw new Error('Invalid shill category');
    }
    const shill_category_id = category.id;

    // Set start_time to now if not provided
    const start = start_time ? new Date(start_time) : new Date();
    const hoursToAdd = getHoursToAddByCategory(shill_category_name);
    const end_time = new Date(start.getTime() + hoursToAdd * 60 * 60 * 1000);
    return { shill_category_id, start, end_time };
}

// Helper to get hours to add based on shill category name
function getHoursToAddByCategory(shill_category_name) {
    if (shill_category_name && shill_category_name.toLowerCase() === 'hard shill') return 72;
    if (shill_category_name && shill_category_name.toLowerCase() === 'medium shill') return 48;
    return 24; // default for soft shill or any other
}

// Helper to create a shill purchase entry
async function createDefaultShillPurchase(shill_id, contract_address, wallet_address, shill_category_name, tx_hash) {
    let amount = 1;
    if (shill_category_name && shill_category_name.toLowerCase() === 'hard shill') amount = 5;
    else if (shill_category_name && shill_category_name.toLowerCase() === 'medium shill') amount = 3;
    // else default is 1 for soft shill or any other
    await db.ShillPurchases.create({
        wallet_address: wallet_address || null,
        amount,
        shill_id,
        contract_address,
        tx_hash
    });
}

const createShillBoard = async (req, res) => {
    try{
        let { contract_address, shill_category_name, wallet_address, tx_hash } = req.body;
        const start_time = new Date();

        const isValid = ethers.isAddress(wallet_address);
        if (!isValid) {
            return res.status(400).send(Response.sendResponse(false, null, "Invalid wallet address", 400));
        }

        let categoryData;
        try {
            categoryData = await getCategoryIdAndEndTime(shill_category_name, start_time);
        } catch (err) {
            return res.status(400).send(Response.sendResponse(false, null, err.message, 400));
        }
        const { shill_category_id, start, end_time } = categoryData;

        // Check if an active shill exists
        const existingShill = await db.ShillBoard.findOne({
            where: {
                contract_address,
                end_time: { [db.Sequelize.Op.gt]: new Date() }
            }
        });

        if (existingShill) {
            // Add the new duration to the existing end_time
            const hoursToAdd = getHoursToAddByCategory(shill_category_name);
            const newEndTime = new Date(new Date(existingShill.end_time).getTime() + hoursToAdd * 60 * 60 * 1000);
            await existingShill.update({ end_time: newEndTime });
            // Create a new shill purchase entry for this shill
            await createDefaultShillPurchase(existingShill.id, contract_address, wallet_address, shill_category_name, tx_hash);
            return res.status(200).send(Response.sendResponse(true, existingShill, '', 200));
        }

        // Create a new shill board entry
        let response = await db.ShillBoard.create({ contract_address, start_time: start, end_time, shill_category_id });

        // Create a default shill purchase entry
        await createDefaultShillPurchase(response.id, contract_address, wallet_address, shill_category_name, tx_hash);

        return res.status(201).send(Response.sendResponse(true,response,SHILL_BOARD_CONSTANTS_STATUS.SHILL_BOARD_CREATED,201));
    }catch(err) {
        console.log("err", err);
        return res.status(500).send(Response.sendResponse(false,null,SHILL_BOARD_CONSTANTS_STATUS.ERROR_OCCURED,500));
    }
}

const getShillBoards = async (req, res) => {
    try {
        const now = new Date();
        const query = `
        SELECT 
            sb.id, 
            sb.contract_address, 
            sb.start_time, 
            sb.end_time, 
            tm.token_name, 
            tm.photo_url AS token_image,
            COALESCE(SUM(v.up_vote), 0) AS up_vote,
            COALESCE(SUM(v.down_vote), 0) AS down_vote
        FROM shill_boards sb
        LEFT JOIN token_metadata tm ON LOWER(sb.contract_address) = LOWER(tm.contract_address)
        LEFT JOIN votes v ON sb.id = v.shill_id
        WHERE sb.end_time > :now
        GROUP BY 
            sb.id, 
            sb.contract_address, 
            sb.start_time, 
            sb.end_time, 
            tm.token_name, 
            tm.photo_url;
        `;
        const response = await db.sequelize.query(query, {
            replacements: { now },
            type: db.Sequelize.QueryTypes.SELECT
        });
        return res.status(200).send(Response.sendResponse(true, response, null, 200));
    } catch (err) {
        return res.status(500).send(Response.sendResponse(false, null, SHILL_BOARD_CONSTANTS_STATUS.ERROR_OCCURED, 500));
    }
}

module.exports = { 
    createShillBoard, 
    getShillBoards
}


