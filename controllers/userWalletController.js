const Response = require("../classes/Response");
const db = require("../config/db.config");

const connectWallet = async (req, res) => {
  try {
    const { user_name, wallet_address } = req.body;

    // Check if the wallet already exists
    const existingWallet = await db.UserWallet.findOne({ where: { wallet_address } });
    if (existingWallet) {
      return res.status(400).send({
        isSuccess: false,
        message: 'Wallet already connected',
      });
    }

    // Save the wallet information
    const newWallet = await db.UserWallet.create({ user_name, wallet_address });

    return res.status(200).send({
      isSuccess: true,
      message: 'Wallet connected successfully',
      data: newWallet,
    });
  } catch (err) {
    console.error('Error in connectWallet:', err);
    return res.status(500).send({
      isSuccess: false,
      message: 'Internal Server Error',
    });
  }
};

const getUserWalletByWalletAddress = async(req,res) => {
  try{
    const { wallet_address } = req.params;

    let walletData = await db.UserWallet.findOne({
      where: {
        wallet_address: wallet_address
      }
    })

    return res.status(200).send({
      isSuccess: true,
      message: null,
      data: walletData,
    });

  }catch (err) {
    console.error('Error in connectWallet:', err);
    return res.status(500).send({
      isSuccess: false,
      message: 'Internal Server Error',
    });
  }
}

module.exports = {
  connectWallet,
  getUserWalletByWalletAddress
};