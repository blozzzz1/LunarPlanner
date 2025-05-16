import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/elevation', async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) return res.status(400).send('Missing lat or lng');

  // Пример запроса на внешний WMS (замени на рабочий сервер)
  const wmsUrl = `https://example-moon-elevation-wms.com?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&QUERY_LAYERS=LOLA_DEM&LAYERS=LOLA_DEM&STYLES=&BBOX=-180,-90,180,90&SRS=EPSG:4326&WIDTH=256&HEIGHT=256&X=128&Y=128&INFO_FORMAT=text/plain&FEATURE_COUNT=1&FORMAT=image/png&lat=${lat}&lon=${lng}`;

  try {
    const response = await fetch(wmsUrl);
    const text = await response.text();

    // Простейший парсинг (пример: "Elevation: 1347.8")
    const match = text.match(/[-\d.]+/);
    const elevation = match ? parseFloat(match[0]) : null;

    if (elevation !== null) {
      res.json({ elevation });
    } else {
      res.status(404).send('Elevation not found');
    }
  } catch (err) {
    res.status(500).send('Error fetching elevation');
  }
});

const PORT = 4000;
app.listen(PORT, () => console.log(`🌕 Proxy server running on http://localhost:${PORT}`));
