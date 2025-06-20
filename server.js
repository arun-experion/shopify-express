const express = require('express');
const axios = require('axios');
const cors = require('cors');
const PORT = process.env.PORT || 3000;
const app = express();

require('dotenv').config();

app.use(express.json());

// add the origins eg http://localhost:3000, https://yourdomain.com in env variable for CORS error handling
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// const SHOPIFY_STORE = 'test-store-treesa';
const SHOPIFY_STORE = process.env.STORE_NAME;
const ADMIN_API_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const API_VERSION=process.env.API_VERSION;

// helper function to construct Shopify API URL
function getShopifyApiUrl(endpoint){
  return `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${API_VERSION}/${endpoint}`
};

//helper function to update customer interactions
async function updateCustomerInteractions(customerId, newEvent) {
  try{
    const metafieldResponse = await axios.get(
      getShopifyApiUrl(`customers/${customerId}/metafields.json?namespace=custom&key=customer_interactions`),
      { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
    );
    const existingMetafield = metafieldResponse.data.metafields[0];
    let currentInteractions = [];
    if(existingMetafield){
      try{
        currentInteractions=JSON.parse(existingMetafield.value);
        if(!Array.isArray(currentInteractions)){
          currentInteractions = [currentInteractions];
        }
      }
      catch(e){
        console.error('Error parsing existing interactions:', e);
      }
    }

    currentInteractions.push(newEvent);

    const metafieldData={
      metafield:{
        namespace: 'custom',
        key: 'customer_interactions',
        type: 'json',
        value: JSON.stringify(currentInteractions)
      }
    };

    if(existingMetafield){
      await axios.put(
        getShopifyApiUrl(`metafields/${existingMetafield.id}.json`),
        metafieldData,
        { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
      );
    }
    else{
      axios.post(
        getShopifyApiUrl(`customers/${customerId}/metafields.json`),
        metafieldData,
        { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
      );
    }
    return true;
  }
  catch(error){
    console.error('Error updating customer interactions:', error.response?.data || error.message);
    throw new Error('Failed to update customer interactions');
  }
}

// Update customer
app.put('/update-customer/:customerId', async (req, res) => {
  const { customerId } = req.params;
  const { first_name, last_name, email, dob } = req.body;

  try {
    const response = await axios({
      method: 'put',
      url: `https://${SHOPIFY_STORE}/admin/api/2024-01/customers/${customerId}.json`,
      headers: {
        'X-Shopify-Access-Token': ADMIN_API_TOKEN,
        'Content-Type': 'application/json',
      },
      data: {
        customer: {
          id: customerId,
          first_name,
          last_name,
          email,
        },
      },
    });

    const { data } = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/customers/${customerId}/metafields.json`,
      { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
    );
    
    const existingDob = data.metafields.find(m => m.namespace === 'custom' && m.key === 'dob');
    
    if (existingDob) {
      await axios.put(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/metafields/${existingDob.id}.json`,
        {
          metafield: {
            id: existingDob.id,
            value: dob,
            type: 'date'
          }
        },
        { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
      );
    } else {
      // create new
      await axios.post(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/customers/${customerId}/metafields.json`,
        {
          metafield: {
            namespace: 'custom',
            key: 'dob',
            type: 'date',
            value: dob
          }
        },
        { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
      );
    }
    
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error updating customer:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// endpoint to post add to cart user interactions
app.post('/api/track-add-to-cart',async (req,res)=>{
  try{
    const{productId, variantId, customerId, visitorId}=req.body;

  if(!customerId &&!visitorId){
    return res.status(400).json({
      succcess:false,
      error:'customerId or visitorId is required'
    })
  }

  const newEvent={
    eventType:'add_to_cart',
    productId,
    variantId,
    customerId: customerId || null,
    visitorId,
    timestamp: new Date().toISOString()
  }

  if(customerId){
    await updateCustomerInteractions(customerId, newEvent);
  }
  res.json({ success: true });
  }
  catch(error){
    console.error('Error tracking add-to-cart:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Failed to track event' });
  }
});

// endpoint to post wishlist user interactions
app.post('/api/track-wishlist',async(req,res)=>{
  try{
    const{productId,variantId,customerId,visitorId,eventType}=req.body;
    if(!customerId && !visitorId){
      return res.status(400).json({
        success:false,
        error:'customerId or visitorId is required'
      })
    }

    const newEvent = {
      eventType: eventType,
      productId,
      variantId,
      customerId: customerId || null,
      visitorId,
      timestamp: new Date().toISOString()
    };

    if(customerId){
      await updateCustomerInteractions(customerId, newEvent);
    }
    res.json({ success: true });
  }
  catch(error){
    console.error('Error tracking wishlist:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Failed to track wishlist event' });
  }
});

// endpoint to get user interactions
app.get('/api/user-interactions', async(req,res)=>{
  try{
    const {customer_id}= req.query;
    if(!customer_id){
      return res.status(400).json({
        success: false,
        message: 'customer_id parameter is required'
      });
    }

    const response=await axios.get(
      getShopifyApiUrl(`customers/${customer_id}/metafields.json?namespace=custom&key=customer_interactions`),
      { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
    );
    let interactions = [];
    if(response.data.metafields?.length>0){
      try{
        interactions = JSON.parse(response.data.metafields[0].value);
        if(!Array.isArray(interactions)){
          interactions = [interactions];
        }
      }
      catch(e){
        console.error('Error parsing interactions:', e);
      }
    }

    interactions.sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp));
    res.json({
      success: true,
      count: interactions.length,
      interactions
    });
  }
  catch(error){
    console.error('Error fetching user interactions:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch interaction data',
      error: error.response?.data?.errors || error.message
    });
  }
});


// NEW: Get customer's used discount codes with order info
app.get('/api/customer-discount-usage', async (req, res) => {
  try {
    const {customer_id}= req.query;
    console.log("customer_id", customer_id)

    if(!customer_id){
        return res.status(400).json({
          success: false,
          message: 'customer_id parameter is required'
        });
    }

    const response=await axios.get(
      getShopifyApiUrl(`customers/${customer_id}/metafields.json?namespace=custom&key=discount_usage`),
      { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
    );

    if(response.data.metafields?.length>0){
      try{
        const discountInfo = JSON.parse(response.data.metafields[0].value);
        res.json({
          success: true,
          count: discountInfo.length,
          discountInfo
        });
      }
      catch(e){
        console.error('Error parsing discount info:', e);
         res.json({
          success: false,
          message: "Error parsing discount info",
          error: e
        });
      }
    } else {
      res.json({
          success: false,
          message: "Discount data not available for this user",
          error: e
        });
    }
  } catch (error) {
    console.error('Error getting discount usage:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to get discount usage for customer',
      details: error.response?.data || error.message
    });
  }
});

// Toggle Spa Favorites
app.post('/spa-favorites/toggle', async (req, res) => {
  const { customer_id, spa_id, spa_handle, action } = req.body;

  if (!customer_id) {
    return res.status(401).json({ error: 'Customer ID is required' });
  }

  if (!spa_id || !action) {
    return res.status(400).json({ error: 'Spa ID and action are required' });
  }

  try {
    const { data } = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/customers/${customer_id}/metafields.json`,
      { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
    );

    const existingFavorite = data.metafields.find(m => m.namespace === 'custom' && m.key === 'spa_favourite');

    if (action === 'add') {
      const metafieldData = {
        metafield: {
          namespace: 'custom',
          key: 'spa_favourite',
          type: 'metaobject_reference',
          value: `gid://shopify/Metaobject/${spa_id}`
        }
      };

      if (existingFavorite) {
        await axios.put(
          `https://${SHOPIFY_STORE}/admin/api/2024-01/metafields/${existingFavorite.id}.json`,
          {
            metafield: {
              id: existingFavorite.id,
              value: `gid://shopify/Metaobject/${spa_id}`,
              type: 'metaobject_reference'
            }
          },
          { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
        );
      } else {
        await axios.post(
          `https://${SHOPIFY_STORE}/admin/api/2024-01/customers/${customer_id}/metafields.json`,
          metafieldData,
          { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
        );
      }

      res.json({ 
        success: true, 
        message: 'Spa added to favorites',
        action: 'added'
      });

    } else if (action === 'remove') {
      if (existingFavorite) {
        await axios.delete(
          `https://${SHOPIFY_STORE}/admin/api/2024-01/metafields/${existingFavorite.id}.json`,
          { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
        );

        res.json({ 
          success: true, 
          message: 'Spa removed from favorites',
          action: 'removed'
        });
      } else {
        res.json({ 
          success: true, 
          message: 'No favorite to remove',
          action: 'none'
        });
      }
    } else {
      res.status(400).json({ error: 'Invalid action. Use "add" or "remove"' });
    }

  } catch (error) {
    console.error('Error updating spa favorites:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to update spa favorites',
      details: error.response?.data || error.message 
    });
  }
});

// Get customer's favorite spa ID
app.get('/spa-favorites/:customerId', async (req, res) => {
  const { customerId } = req.params;

  try {
    const { data } = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/customers/${customerId}/metafields.json`,
      { headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN } }
    );

    const favoriteMetafield = data.metafields.find(m => m.namespace === 'custom' && m.key === 'spa_favourite');

    if (favoriteMetafield && favoriteMetafield.value) {
      const spaId = favoriteMetafield.value.replace('gid://shopify/Metaobject/', '');

      res.json({ 
        success: true, 
        favorite_spa_id: spaId,
        gid: favoriteMetafield.value
      });
    } else {
      res.json({ 
        success: true, 
        favorite_spa_id: null,
        message: 'No favorite spa found'
      });
    }

  } catch (error) {
    console.error('Error getting spa favorites:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get spa favorites',
      details: error.response?.data || error.message 
    });
  }
});

// Get spa details by metaobject ID
app.get('/spa-details/:spaId', async (req, res) => {
  const { spaId } = req.params;

  try {
    // Fetch spa details using GraphQL Admin API
    const query = `
      query getSpaDetails($id: ID!) {
        metaobject(id: $id) {
          id
          handle
          fields {
            key
            value
          }
        }
      }
    `;

    const response = await axios.post(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
      {
        query,
        variables: {
          id: `gid://shopify/Metaobject/${spaId}`
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }

    const metaobject = response.data.data.metaobject;

    if (!metaobject) {
      return res.status(404).json({ error: 'Spa not found' });
    }

    // Transform fields array to object for easier access
    const spaData = {
      id: spaId,
      handle: metaobject.handle,
    };

    metaobject.fields.forEach(field => {
      spaData[field.key] = field.value;
    });

    res.json({ 
      success: true, 
      spa: spaData
    });

  } catch (error) {
    console.error('Error getting spa details:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get spa details',
      details: error.response?.data || error.message 
    });
  }
});

// Get customer's favorite spa with full details
app.get('/customer-favorite-spa/:customerId', async (req, res) => {
  const { customerId } = req.params;

  try {
    // First get the customer's favorite spa ID
    const favResponse = await axios.get(`http://localhost:${PORT}/spa-favorites/${customerId}`);

    if (!favResponse.data.success || !favResponse.data.favorite_spa_id) {
      return res.json({
        success: true,
        message: 'No favorite spa found',
        spa: null
      });
    }

    // Then get the spa details
    const spaResponse = await axios.get(`http://localhost:${PORT}/spa-details/${favResponse.data.favorite_spa_id}`);

    if (!spaResponse.data.success) {
      return res.json({
        success: false,
        message: 'Error fetching spa details',
        spa: null
      });
    }

    res.json({
      success: true,
      spa: spaResponse.data.spa
    });

  } catch (error) {
    console.error('Error getting customer favorite spa:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get customer favorite spa',
      details: error.response?.data || error.message 
    });
  }
});

// NEW: Get all spa details in GeoJSON format
app.get('/all-spas', async (req, res) => {
  try {
    const query = `
      query getAllSpas($first: Int!) {
        metaobjects(type: "spa_details", first: $first) {
          edges {
            node {
              id
              handle
              fields {
                key
                value
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    let allSpas = [];
    let hasNextPage = true;
    let cursor = null;

    // Fetch all spas with pagination
    while (hasNextPage) {
      const variables = {
        first: 50, // Shopify's max per request
        ...(cursor && { after: cursor })
      };

      const response = await axios.post(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
        {
          query: cursor ? query.replace('$first: Int!', '$first: Int!, $after: String!').replace('first: $first', 'first: $first, after: $after') : query,
          variables
        },
        {
          headers: {
            'X-Shopify-Access-Token': ADMIN_API_TOKEN,
            'Content-Type': 'application/json',
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      const { edges, pageInfo } = response.data.data.metaobjects;
      allSpas.push(...edges.map(edge => edge.node));
      
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }

    // Transform to GeoJSON format matching your original structure
    const geoJsonFeatures = allSpas.map(spa => {
      // Convert fields array to object
      const fieldsObj = {};
      spa.fields.forEach(field => {
        fieldsObj[field.key] = field.value;
      });

      // Extract spa ID from GID
      const spaId = spa.id.replace('gid://shopify/Metaobject/', '');

      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [
            parseFloat(fieldsObj.longitude) || 0, 
            parseFloat(fieldsObj.latitude) || 0
          ]
        },
        properties: {
          handle: spa.handle,
          id: spaId,
          store_name: fieldsObj.name || '',
          address: fieldsObj.address || '',
          postcode: fieldsObj.postcode || '',
          phone: fieldsObj.phone_number || '',
          state: fieldsObj.state || '',
          location_country: fieldsObj.location_country || '',
          email: fieldsObj.email || '',
          opening_time_monday: fieldsObj.opening_time_monday || '',
          opening_time_tuesday: fieldsObj.opening_time_tuesday || '',
          opening_time_wednesday: fieldsObj.opening_time_wednesday || '',
          opening_time_thursday: fieldsObj.opening_time_thursday || '',
          opening_time_friday: fieldsObj.opening_time_friday || '',
          opening_time_saturday: fieldsObj.opening_time_saturday || '',
          opening_time_sunday: fieldsObj.opening_time_sunday || '',
        }
      };
    });

    res.json({
      success: true,
      features: geoJsonFeatures,
      total: geoJsonFeatures.length
    });

  } catch (error) {
    console.error('Error getting all spas:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get all spas',
      details: error.response?.data || error.message 
    });
  }
});

// NEW: Get all spas in the exact window.storedata format
app.get('/storedata', async (req, res) => {
  try {
    const spaResponse = await axios.get(`http://localhost:${PORT}/all-spas`);
    
    if (!spaResponse.data.success) {
      throw new Error('Failed to fetch spa data');
    }

    // Return the features array directly to match window.storedata format
    res.json(spaResponse.data.features);

  } catch (error) {
    console.error('Error getting store data:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get store data',
      details: error.response?.data || error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});