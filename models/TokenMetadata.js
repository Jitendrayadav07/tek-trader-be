module.exports = (sequelize, DataTypes) => {
    const CommunityProfile = sequelize.define('token_metadata', {
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
        },
        // Community fields
        community_id: {
            type: DataTypes.UUID,
            allowNull: false,
            comment: 'Community ID from API response'
        },
        signer: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Signer information'
        },
        contract_address: {
            type: DataTypes.TEXT,
            allowNull: false,
            comment: 'Contract address of the token'
        },
        name: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Community name'
        },
        photo_url: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Community photo URL'
        },
        token_name: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Token name'
        },
        ticker: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Token ticker symbol'
        },
        bc_group_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Blockchain group ID'
        },
        token_created_on: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Token creation date'
        },
        is_owner_external: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            comment: 'Whether owner is external'
        },
        
        // Owner fields
        owner_id: {
            type: DataTypes.UUID,
            allowNull: true,
            comment: 'Owner ID from API response'
        },
        owner_created_on: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Owner creation date'
        },
        owner_twitter_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
            comment: 'Owner Twitter ID'
        },
        owner_twitter_handle: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Owner Twitter handle'
        },
        owner_twitter_name: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Owner Twitter name'
        },
        owner_twitter_picture: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Owner Twitter picture URL'
        },
        owner_last_login_twitter_picture: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Owner last login Twitter picture URL'
        },
        owner_banner_url: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Owner banner URL'
        },
        owner_address: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Owner address'
        },
        owner_dynamic_address: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Owner dynamic address'
        },
        
        // Additional fields for data integrity
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        freezeTableName: true,
        timestamps: true,
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ['community_id']
            },
            {
                fields: ['contract_address']
            },
            {
                fields: ['owner_id']
            },
            {
                fields: ['bc_group_id']
            }
        ]
    });

    return CommunityProfile;
};