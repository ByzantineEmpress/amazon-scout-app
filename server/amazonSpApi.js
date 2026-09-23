const axios = require('axios');

/**
 * Amazon Selling Partner API (SP-API) Connector
 * 
 * Activated automatically when SP-API credentials are configured in .env:
 * - SP_API_LWA_CLIENT_ID
 * - SP_API_LWA_CLIENT_SECRET
 * - SP_API_REFRESH_TOKEN
 * - SP_API_SELLER_ID
 * - SP_API_MARKETPLACE_ID (Default: ATVPDKIKX0DER for US)
 */

let cachedAccessToken = null;
let tokenExpiresAt = 0;

function isSpApiConfigured() {
  return !!(
    process.env.SP_API_LWA_CLIENT_ID &&
    process.env.SP_API_LWA_CLIENT_SECRET &&
    process.env.SP_API_REFRESH_TOKEN &&
    process.env.SP_API_SELLER_ID
  );
}

/**
 * Exchange LWA Refresh Token for a temporary SP-API Access Token
 */
async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const res = await axios.post('https://api.amazon.com/auth/o2/token', {
    grant_type: 'refresh_token',
    refresh_token: process.env.SP_API_REFRESH_TOKEN,
    client_id: process.env.SP_API_LWA_CLIENT_ID,
    client_secret: process.env.SP_API_LWA_CLIENT_SECRET
  });

  cachedAccessToken = res.data.access_token;
  tokenExpiresAt = Date.now() + (res.data.expires_in * 1000);
  return cachedAccessToken;
}

/**
 * Check listing restrictions for an ASIN via SP-API
 * GET /listings/2021-08-01/restrictions
 */
async function checkListingsRestrictions(asin, conditionType = 'used_good') {
  if (!isSpApiConfigured()) return null;

  try {
    const token = await getAccessToken();
    const marketplaceId = process.env.SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER'; // US
    const sellerId = process.env.SP_API_SELLER_ID;

    const res = await axios.get('https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/restrictions', {
      params: {
        asin,
        sellerId,
        marketplaceIds: marketplaceId,
        conditionType
      },
      headers: {
        'x-amz-access-token': token,
        'Content-Type': 'application/json'
      }
    });

    const restrictions = res.data.restrictions || [];
    if (restrictions.length === 0) {
      return {
        status: 'UNGATED',
        canSell: true,
        reason: 'Direct SP-API check: Your account is fully eligible to list this item.'
      };
    }

    const reasons = restrictions[0].reasons || [];
    const hasApproval = reasons.some(r => r.reasonCode === 'APPROVAL_REQUIRED');
    const notEligible = reasons.some(r => r.reasonCode === 'NOT_ELIGIBLE');

    return {
      status: notEligible ? 'HARD_GATED' : (hasApproval ? 'APPROVAL_REQUIRED' : 'RESTRICTED'),
      canSell: false,
      reason: reasons.map(r => r.message).join(' | '),
      reasons
    };
  } catch (err) {
    console.warn('SP-API Restrictions lookup error:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Retrieve Used Item Offers & Pricing via SP-API
 * GET /products/pricing/v0/items/{asin}/offers
 */
async function getItemPricing(asin) {
  if (!isSpApiConfigured()) return null;

  try {
    const token = await getAccessToken();
    const marketplaceId = process.env.SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER';

    const res = await axios.get(`https://sellingpartnerapi-na.amazon.com/products/pricing/v0/items/${asin}/offers`, {
      params: {
        MarketplaceId: marketplaceId,
        ItemCondition: 'Used'
      },
      headers: {
        'x-amz-access-token': token,
        'Content-Type': 'application/json'
      }
    });

    const payload = res.data.payload || {};
    const summary = payload.Summary || {};
    const lowestPrices = summary.LowestPrices || [];
    const buyBoxPrices = summary.BuyBoxPrices || [];

    const usedLowest = lowestPrices.find(p => p.condition === 'used');
    const usedMin = usedLowest ? usedLowest.ListingPrice?.Amount : null;

    const usedBb = buyBoxPrices.find(p => p.condition === 'used');
    const usedBuyBox = usedBb ? usedBb.ListingPrice?.Amount : null;

    const totalUsedOffers = summary.TotalOfferCount || 0;

    return {
      usedMin,
      usedBuyBox,
      usedOffers: totalUsedOffers
    };
  } catch (err) {
    console.warn('SP-API Pricing error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = {
  isSpApiConfigured,
  checkListingsRestrictions,
  getItemPricing
};
