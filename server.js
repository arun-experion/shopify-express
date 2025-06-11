const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 3000;

const SHOPIFY_STORE = 'kavithabs-store.myshopify.com';
// const SHOPIFY_STORE = 'test-store-treesa.myshopify.com';
const ADMIN_API_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

app.use(cors());
app.use(express.json());

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

// NEW: Get spa details by metaobject ID
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

// NEW: Get customer's favorite spa with full details
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});