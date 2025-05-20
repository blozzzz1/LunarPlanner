import React, { useEffect, useRef, useState } from 'react';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import TileImage from 'ol/source/TileImage';
import { createXYZ, TileGrid } from 'ol/tilegrid';
import { get as getProjection, transform } from 'ol/proj';
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import 'ol/ol.css';
import { getElevationFromColor } from './helpers/color';
import { haversineDistance } from './helpers/haversineDistance';
import Overlay from 'ol/Overlay';
import { moduleIcons, moduleShapes } from './moduleIcons'; // 👉 вынеси SVG в отдельный файл, если хочешь
import "./MoonMap.css"
import { updateOverlayClass } from './helpers/updateOverlayClass';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import Stroke from 'ol/style/Stroke';
import { LineString } from 'ol/geom';
import { Feature } from 'ol';
import Header from './components/Header';
import { getTileFromCache, saveTileToCache } from './tileCache';
import ImageTile from 'ol/ImageTile';


// Регистрация проекции IAU2000:30166
proj4.defs(
    'IAU2000:30166',
    '+proj=ortho +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs'
);
register(proj4);

type Mode = 'view' | 'place' | 'edit';

interface Module {
    id: string;
    name: string;
    radius: number;
    description:string;
    additionalInfo:string;
}

export interface Zone {
    id: number;
    type: string;
    name: string;
    coord: [number, number]; // [lon, lat]
    radius: number;
    overlay: Overlay;
}

const exclusionDistances: Record<string, Record<string, number>> = {
    habitat: { power: 100 },
    power: { habitat: 100, launchpad: 50 },
    launchpad: { habitat: 100 },
    sports: { industrial: 80, mining: 100 },
    medical: { landfill: 150, industrial: 60 },
    admin: { mining: 90, power: 40 },
    lab: { mining: 80, industrial: 50 },
    repair: { industrial: 30, landfill: 70 },
    observatory: { launchpad: 50, power: 60 },
    greenhouse: { industrial: 100, landfill: 120 },
    landfill: { habitat: 200, greenhouse: 120, medical: 150 },
    industrial: { habitat: 120, greenhouse: 100, medical: 60 },
    mining: { habitat: 150, sports: 100, admin: 90 },
};

const initialModules: Module[] = [
    { 
        id: 'habitat', 
        name: 'Жилой модуль', 
        radius: 50, 
        description: 'Модуль для проживания, обеспечивающий комфортные условия для жизни.', 
        additionalInfo: 'Включает спальни, кухни и общие зоны.' 
    },
    { 
        id: 'lab', 
        name: 'Исследовательский модуль', 
        radius: 70, 
        description: 'Модуль для научных исследований и экспериментов.', 
        additionalInfo: 'Оснащен лабораторным оборудованием и рабочими местами для ученых.' 
    },
    { 
        id: 'power', 
        name: 'Солнечная электроснация', 
        radius: 100, 
        description: 'Модуль для генерации солнечной энергии.', 
        additionalInfo: 'Обеспечивает электроэнергией другие модули.' 
    },
    { 
        id: 'launchpad', 
        name: 'Космодром', 
        radius: 80, 
        description: 'Площадка для запуска космических аппаратов.', 
        additionalInfo: 'Содержит инфраструктуру для подготовки и запуска ракет.' 
    },
    { 
        id: 'sports', 
        name: 'Спортивный модуль', 
        radius: 60, 
        description: 'Модуль для спортивных мероприятий и тренировок.', 
        additionalInfo: 'Включает спортивные площадки и тренажерные залы.' 
    },
    { 
        id: 'medical', 
        name: 'Медицинский модуль', 
        radius: 55, 
        description: 'Модуль для оказания медицинской помощи.', 
        additionalInfo: 'Оснащен медицинским оборудованием и палатами для пациентов.' 
    },
    { 
        id: 'admin', 
        name: 'Административный модуль', 
        radius: 45, 
        description: 'Модуль для управления и координации деятельности.', 
        additionalInfo: 'Содержит офисные помещения и конференц-залы.' 
    },
    { 
        id: 'repair', 
        name: 'Ремонтный модуль', 
        radius: 65, 
        description: 'Модуль для ремонта и обслуживания оборудования.', 
        additionalInfo: 'Оснащен инструментами и запасными частями.' 
    },
    { 
        id: 'observatory', 
        name: 'Астрономическая площадка', 
        radius: 40, 
        description: 'Модуль для наблюдения за небесными телами.', 
        additionalInfo: 'Содержит телескопы и оборудование для астрономических исследований.' 
    },
    { 
        id: 'greenhouse', 
        name: 'Плантация', 
        radius: 90, 
        description: 'Модуль для выращивания растений и сельского хозяйства.', 
        additionalInfo: 'Обеспечивает условия для роста растений и сбора урожая.' 
    },
    { 
        id: 'landfill', 
        name: 'Мусорный полигон', 
        radius: 75, 
        description: 'Модуль для утилизации отходов.', 
        additionalInfo: 'Обеспечивает безопасное хранение и переработку мусора.' 
    },
    { 
        id: 'industrial', 
        name: 'Производственное предприятие', 
        radius: 110, 
        description: 'Модуль для производства товаров и услуг.', 
        additionalInfo: 'Содержит производственные линии и склады.' 
    },
    { 
        id: 'mining', 
        name: 'Добывающая шахта', 
        radius: 85, 
        description: 'Модуль для добычи полезных ископаемых.', 
        additionalInfo: 'Оснащен оборудованием для горных работ.' 
    }
];



// Выносим логику расчета уклона в отдельную функцию
const calculateSlopeAtPixel = (pixelX: number, pixelY: number, ctx: CanvasRenderingContext2D): { degrees: number, direction: string } | null => {
  try {
    const offsets = [
      { x: 0, y: 0 },   // Центральная точка
      { x: 10, y: 0 },   // Восток
      { x: -10, y: 0 },  // Запад
      { x: 0, y: 10 },   // Юг
      { x: 0, y: -10 }   // Север
    ];

    const elevations = offsets.map(offset => {
      const x = pixelX + offset.x;
      const y = pixelY + offset.y;
      const data = ctx.getImageData(x, y, 1, 1).data;
      return getElevationFromColor(data[0], data[1], data[2]) as number;
    });

    const centerElevation = elevations[0];
    const distance = 500;

    const dz_dx = (elevations[1] - elevations[2]) / (2 * distance);
    const dz_dy = (elevations[3] - elevations[4]) / (2 * distance);

    const slopeDegrees = Math.atan(Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy)) * (180 / Math.PI);

    // Расчет направления (как у вас в коде)
    const deltas = [
      { value: elevations[1] - centerElevation, dir: '→' },
      { value: elevations[2] - centerElevation, dir: '←' },
      { value: elevations[3] - centerElevation, dir: '↓' },
      { value: elevations[4] - centerElevation, dir: '↑' }
    ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    return {
      degrees: slopeDegrees,
      direction: deltas[0].dir
    };
  } catch {
    return null;
  }
};



const projectCoordinates = (coords: [number, number], fromProj: string, toProj: string): [number, number] => {
    if (fromProj === toProj) return coords;
    try {
        return transform(coords, fromProj, toProj) as [number, number];
    } catch (e) {
        console.warn('Ошибка преобразования координат:', e);
        return coords;
    }
};

const hasConflict = (zoneA: Zone, otherZones: Zone[]) => {
    return otherZones.some(zoneB => {

        const d = haversineDistance(

            { lon: zoneA.coord[0], lat: zoneA.coord[1] },
            { lon: zoneB.coord[0], lat: zoneB.coord[1] }
        );

        const requiredDistance =
            exclusionDistances[zoneA.type]?.[zoneB.type] ??
            exclusionDistances[zoneB.type]?.[zoneA.type];

        return requiredDistance !== undefined && d < requiredDistance;
    });
};



export default function MoonMap() {
    const [mode, setMode] = useState<Mode>('view');
    const [zones, setZones] = useState<Zone[]>([]);
    const [selectedModule, setSelectedModule] = useState<Module | null>(null);
    const [draggedZoneId, setDraggedZoneId] = useState<number | null>(null);


    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<OlMap | null>(null);

    const [projectionType, setProjectionType] = useState<'cylindrical' | 'orthographic'>('cylindrical');
    const [centerLon, setCenterLon] = useState(0);
    const [centerLat, setCenterLat] = useState(0);
    const [cursorCoords, setCursorCoords] = useState<{ lon: number; lat: number }>({ lon: 0, lat: 0 });
    const [elevation, setElevation] = useState<number | null>(null); 
    const [slope, setSlope] = useState<Slope>(null);

    const [layerName, setLayerName] = useState<'luna_wac_global' | 'luna_wac_dtm'>('luna_wac_global');
    const [showLayerMenu, setShowLayerMenu] = useState(false);
    const tileLayerRef = useRef<TileLayer<TileImage> | null>(null);

    const [pendingZone, setPendingZone] = useState<Zone | null>(null);
    const [dragOverlay, setDragOverlay] = useState<Overlay | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragPanInteractionRef = useRef<any>(null);
    const [originalPosition, setOriginalPosition] = useState<[number, number] | null>(null);
    const conflictCircleRef = useRef<Overlay | null>(null);

    const conflictOverlaysRef = useRef<Overlay[]>([]);
    const isConflict = pendingZone ? hasConflict(pendingZone, zones) : false;
    const [activeTab, setActiveTab] = useState<'modules' | 'routes'>('modules');
    const [isCreatingRoute, setIsCreatingRoute] = useState(false);
    const previewRouteLayerRef = useRef<VectorLayer | null>(null);
    const [highlightedRouteId, setHighlightedRouteId] = useState<number | null>(null);



    const viewParamsRef = useRef<{
        center: [number, number];
        zoom: number;
        rotation: number;
        projection: string;
    }>({
        center: [0, 0],
        zoom: 5,
        rotation: 0,
        projection: 'EPSG:4326',
    });

    type Slope = {
    percent: number; 
    degrees: number;  
    direction: string;
    } | null;           

    interface Route {
        id: number;
        from: Zone;
        to: Zone;
        via?: Zone[];
        pathCoords: [number, number][];
        length: number;
    }

    
    const [routes, setRoutes] = useState<Route[]>([]);
    const [newRoute, setNewRoute] = useState<{
        from: Zone | null;
        to: Zone | null;
        via: (Zone | null)[];
    }>({ from: null, to: null, via: [] });


    const handleNewRoute = () => {
        setIsCreatingRoute(true);
        setNewRoute({ from: null, to: null, via: [null] });
    };

    const exportPlan = () => {
        const data = {
            zones: zones.map(({ id, name, type, radius, coord }) => ({ id, name, type, radius, coord })),
            routes: routes.map(({ id, from, to, via, pathCoords, length }) => ({
                id,
                fromId: from.id,
                toId: to.id,
                viaIds: via?.map(v => v.id) || [],
                pathCoords,
                length,
            })),
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'moon-plan.json';
        link.click();
    };


    const importPlan = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target?.result as string);

                const zoneMap = new Map<number, Zone>();

                const newZones: Zone[] = parsed.zones.map((z: any) => {
                    const container = document.createElement('div');
                    const overlay = new Overlay({
                        positioning: 'center-center',
                        element: container,
                        stopEvent: false,
                    });


                    updateOverlayClass(overlay, {
                        pending: false,
                        dragging: false,
                        type: ""
                    });

                    container.innerHTML = `
                <div class="module-shape-wrapper">${moduleShapes[z.type]}</div>
                <div class="module-icon-wrapper">${moduleIcons[z.type]}</div>
              `;



                    mapInstance.current?.addOverlay(overlay);
                    const projected = projectCoordinates(z.coord, 'EPSG:4326', mapInstance.current!.getView().getProjection().getCode());
                    overlay.setPosition(projected);

                    const zone: Zone = {
                        ...z,
                        overlay,
                    };
                    zoneMap.set(z.id, zone);
                    return zone;
                });

                const newRoutes: Route[] = parsed.routes.map((r: any) => ({
                    id: r.id,
                    from: zoneMap.get(r.fromId)!,
                    to: zoneMap.get(r.toId)!,
                    via: r.viaIds.map((id: number) => zoneMap.get(id)!),
                    pathCoords: r.pathCoords,
                    length: r.length,
                }));

                setZones(newZones);
                setRoutes(newRoutes);
            } catch (err) {
                alert('Ошибка загрузки плана: ' + err);
            }
        };
        reader.readAsText(file);
    };



    const filledVia = newRoute.via.filter((z): z is Zone => z !== null);

    const unproject = (coords: number[] | undefined) => {
        if (!coords || isNaN(coords[0]) || isNaN(coords[1])) {
            return { lon: NaN, lat: NaN };
        }

        const radius = 1737400;
        let lon = coords[0];
        let lat = coords[1];

        if (projectionType === 'orthographic') {
            const x = lon / radius;
            const y = lat / radius;
            const r = Math.sqrt(x * x + y * y);
            if (r > 1 || isNaN(r)) {
                return { lon: NaN, lat: NaN };
            }

            const theta = Math.asin(r);
            const phi = Math.atan2(y, x);


            lat = (theta * 180) / Math.PI;
            lon = (phi * 180) / Math.PI;

            lon += centerLon;
            lat = centerLat - lat;

            lon = ((lon + 180) % 360) - 180;
            lat = Math.max(-90, Math.min(90, lat));

        }

        const result = {
            lon: isNaN(lon) ? 0 : lon,
            lat: isNaN(lat) ? 0 : lat,
        };
        return result;
    };

    function updateResolution() {
        const map = mapInstance.current;
        if (!map) return;

        const scaleBarLength = 200;

        const view = map.getView();
        const centerCoordinate = view.getCenter();
        if (!centerCoordinate) return;

        const centerPixel = map.getPixelFromCoordinate(centerCoordinate);
        if (!centerPixel) return;

        const leftPixel = [centerPixel[0] - scaleBarLength / 2, centerPixel[1]];
        const rightPixel = [centerPixel[0] + scaleBarLength / 2, centerPixel[1]];

        const leftCoord = map.getCoordinateFromPixel(leftPixel);
        const rightCoord = map.getCoordinateFromPixel(rightPixel);

        const leftGeo = unproject(leftCoord);
        const rightGeo = unproject(rightCoord);

        const distanceMeters = haversineDistance(leftGeo, rightGeo);
        const labelText = distanceMeters >= 5000
            ? `${(distanceMeters / 1000).toFixed(2)} km`
            : `${distanceMeters.toFixed(2)} m`;

        const text = `${labelText} (at projection center)`;

        const labelDiv = document.getElementById("scale-bar-label");
        if (labelDiv) {
            labelDiv.textContent = text;
        }

        (window as any).resolution_meters_per_pixel = distanceMeters / scaleBarLength;
    }

    const buildRoute = () => {
        if (!newRoute.from || !newRoute.to) return;

        const coords: [number, number][] = [
            newRoute.from.coord,
            ...filledVia.map(v => v.coord),
            newRoute.to.coord
        ];

        let totalLength = 0;

        for (let i = 1; i < coords.length; i++) {


            totalLength += haversineDistance(
                { lon: coords[i - 1][0], lat: coords[i - 1][1] },
                { lon: coords[i][0], lat: coords[i][1] }
            );
        }

        const newRouteObj: Route = {
            id: Date.now(),
            from: newRoute.from,
            to: newRoute.to,
            via: filledVia,
            pathCoords: coords,
            length: totalLength
        };

        setRoutes(prev => [...prev, newRouteObj]);
        setNewRoute({ from: null, to: null, via: [] });
    };

    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        // Удаляем предыдущий слой-превью, если есть
        if (previewRouteLayerRef.current) {
            map.removeLayer(previewRouteLayerRef.current);
            previewRouteLayerRef.current = null;
        }

        if (!newRoute.from || !newRoute.to) return;

        const coords: [number, number][] = [
            newRoute.from.coord,
            ...filledVia.map(z => z.coord),
            newRoute.to.coord
        ];

        const projCoords = coords.map(coord =>
            projectCoordinates(coord, 'EPSG:4326', map.getView().getProjection().getCode())
        );

        const vectorSource = new VectorSource();
        const lineFeature = new Feature({
            geometry: new LineString(projCoords),
        });
        vectorSource.addFeature(lineFeature);

        const vectorLayer = new VectorLayer({
            source: vectorSource,
            style: new Style({
                stroke: new Stroke({
                    color: '#77FF4E',
                    width: 2,

                }),
            }),
        });

        map.addLayer(vectorLayer);
        previewRouteLayerRef.current = vectorLayer;

        return () => {
            if (previewRouteLayerRef.current) {
                map.removeLayer(previewRouteLayerRef.current);
                previewRouteLayerRef.current = null;
            }
        };
    }, [newRoute, projectionType]);
    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        // Очищаем все существующие круги конфликтов
        conflictOverlaysRef.current.forEach(overlay => map.removeOverlay(overlay));
        conflictOverlaysRef.current = [];

        // Если нет pendingZone, прекращаем выполнение
        if (!pendingZone) return;

        const metersPerPixel = (window as any).resolution_meters_per_pixel;
        if (!metersPerPixel) return;

        // Создаем круги конфликтов для каждой зоны
        zones.forEach((zone) => {
            // Пропускаем сам pendingZone, если он уже в списке zones (для редактирования)
            if (zone.id === pendingZone.id) return;

            const distLimit =
                exclusionDistances[pendingZone.type]?.[zone.type] ??
                exclusionDistances[zone.type]?.[pendingZone.type];

            if (!distLimit) return;

            const container = document.createElement('div');
            container.className = 'conflict-circle';

            const overlay = new Overlay({
                element: container,
                positioning: 'center-center',
                stopEvent: false,
            });

            const sizeInPixels = (distLimit * 2) / metersPerPixel;
            container.style.width = `${sizeInPixels}px`;
            container.style.height = `${sizeInPixels}px`;

            const projected = projectCoordinates(zone.coord, 'EPSG:4326', map.getView().getProjection().getCode());
            overlay.setPosition(projected);

            map.addOverlay(overlay);
            conflictOverlaysRef.current.push(overlay);
        });

        // Очистка при размонтировании
        return () => {
            conflictOverlaysRef.current.forEach(overlay => map.removeOverlay(overlay));
            conflictOverlaysRef.current = [];
        };
    }, [pendingZone, zones, projectionType]);





    useEffect(() => {
        const map = new OlMap({
            target: mapRef.current!,
            layers: [],
            view: new View({
                projection: getProjection('EPSG:4326')!,
                center: [0, 0],
                zoom: 3,
                maxZoom: 15,
            }),
        });

        mapInstance.current = map;

        // ⬇️ Сохраняем dragPan
        const dragPan = map.getInteractions().getArray().find((i) => i.constructor.name === 'DragPan');
        if (dragPan) {
            dragPanInteractionRef.current = dragPan;
        }

        return () => map.setTarget(undefined);
    }, [projectionType]);



    useEffect(() => {
        if (!mapInstance.current) return;

        const map = mapInstance.current;

        const cylindricalTileGrid = createXYZ({
            extent: [-180, -90, 180, 90],
            tileSize: [512, 512],
            maxZoom: 15,
            minZoom: 0,
        });

        const orthographicTileGrid = new TileGrid({
            extent: [-1737400, -1737400, 1737400, 1737400],
            tileSize: [512, 512],
            resolutions: Array.from({ length: 11 }, (_, z) => 3474800 / 512 / Math.pow(2, z)),
            minZoom: 0,
        });

        const mapProjection =
            projectionType === 'orthographic'
                ? getProjection('IAU2000:30166')!
                : getProjection('EPSG:4326')!;

        let webmapIndex = 1;
        const getNextWebmapHost = () => {
            const index = (webmapIndex % 12) + 1;
            webmapIndex++;
            return `https://webmap${index}.lroc.asu.edu/`;
        };

        const tileGrid = projectionType === 'orthographic' ? orthographicTileGrid : cylindricalTileGrid;

        const tileSource = new TileImage({
            tileGrid,
            projection: mapProjection,
            tileUrlFunction: ([z, x, y]) => {
                if (z < 0 || z > 15) {
                    return undefined;
                }
                const [minX, minY, maxX, maxY] = tileGrid.getTileCoordExtent([z, x, y]);
                const host = getNextWebmapHost();

                const commonParams = `SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${layerName}&STYLES=&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=true`;

                const url = projectionType === 'orthographic'
                    ? `${host}?${commonParams}&SRS=IAU2000:30166,9001,${centerLon},${centerLat}&BBOX=${minX},${minY},${maxX},${maxY}`
                    : `${host}?${commonParams}&SRS=EPSG:4326&BBOX=${minX},${minY},${maxX},${maxY}`;

                return url;
            },
            crossOrigin: 'anonymous',
            
            tileLoadFunction: async (tile, src) => {
                const imageTile = tile as ImageTile;
                const img = imageTile.getImage() as HTMLImageElement;
                
                // Try to load from cache first
                const cachedTile = await getTileFromCache(src);
                if (cachedTile) {
                    img.src = URL.createObjectURL(cachedTile);
                    return;
                }

                // If not in cache, load from network with retries
                const maxRetries = 3;
                let attempt = 0;

                const loadTile = async () => {
                    try {
                        const response = await fetch(src, { 
                            signal: AbortSignal.timeout(8000 + (attempt * 2000)) // Increase timeout with each retry
                        });
                        
                        if (!response.ok) throw new Error('Network response was not ok');
                        
                        const blob = await response.blob();
                        img.src = URL.createObjectURL(blob);
                        
                        // Save successful load to cache
                        await saveTileToCache(src, blob);
                    } catch (error) {
                        if (attempt < maxRetries) {
                            attempt++;
                            await loadTile();
                        } else {
                            console.warn('Failed to load tile after retries:', src);
                            // Set a minimal error tile
                            img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
                        }
                    }
                };

                await loadTile();
            }
        });


        if (!tileLayerRef.current || !map.getLayers().getArray().includes(tileLayerRef.current)) {
            const newLayer = new TileLayer({
                source: tileSource,
                visible: true,
            });
            map.getLayers().push(newLayer);
            tileLayerRef.current = newLayer;
        } else {
            tileLayerRef.current.setSource(tileSource);
        }

        let view = map.getView();
        let rawCenter = view.getCenter();
        let center: [number, number] = Array.isArray(rawCenter) && rawCenter.length >= 2
            ? [rawCenter[0]!, rawCenter[1]!]
            : [0, 0];

        let zoom = view.getZoom() || 3;
        let rotation = view.getRotation() || 0;
        let projection = view.getProjection().getCode();

        if (projection !== mapProjection.getCode()) {
            try {
                center = transform(center, projection, mapProjection.getCode()) as [number, number];
                if (mapProjection.getCode() === 'EPSG:4326') {
                    center = [
                        ((center[0] + 180) % 360) - 180,
                        Math.max(-90, Math.min(90, center[1])),
                    ];
                }
            } catch {
                center = [0, 0];
            }
        }

        // 💾 Сохраняем актуальные параметры
        viewParamsRef.current = {
            center,
            zoom,
            rotation,
            projection: mapProjection.getCode(),
        };

        // Новый view с сохранёнными параметрами
        const newView = new View({
            projection: mapProjection,
            center,
            zoom,
            rotation,
            maxZoom: 15,
            minZoom: 0,
        });
        map.setView(newView);

        map.updateSize();
        map.renderSync();

    }, [projectionType, centerLon, centerLat, layerName]);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        const interactions = map.getInteractions().getArray();
        const dragPan = interactions.find(i => i.constructor.name === 'DragPan');

        if (dragPan) {
            dragPan.setActive(!isDragging);
        }

        if (isDragging) {
            document.body.style.cursor = 'grabbing';
        } else {
            document.body.style.cursor = 'default';
        }
    }, [isDragging]);

    useEffect(() => {
        if (!dragOverlay || !pendingZone) return;

        let attempts = 0;

        const tryAttach = () => {
            const el = dragOverlay.getElement();
            if (!el) {
                if (attempts < 10) {
                    attempts++;
                    requestAnimationFrame(tryAttach);
                } else {
                    console.warn('⛔ Не удалось найти элемент overlay после 10 попыток');
                }
                return;
            }

            const handleMouseDown = (e: MouseEvent) => {
                if (!(mode === 'place' || mode === 'edit')) return; // 🔒 блокировка вне режима place
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);

                if (dragPanInteractionRef.current) {
                    dragPanInteractionRef.current.setActive(false);
                }
            };

            el.addEventListener('mousedown', handleMouseDown);

            return () => {
                el.removeEventListener('mousedown', handleMouseDown);
            };
        };

        const cleanup = tryAttach();

        return () => {
            if (cleanup) cleanup();
        };
    }, [dragOverlay, pendingZone]);


    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        const vectorSource = new VectorSource();
        const vectorLayer = new VectorLayer({
            source: vectorSource,
            style: (feature) => {
                const routeId = feature.get('routeId');
                const isHighlighted = routeId === highlightedRouteId;

                return new Style({
                    stroke: new Stroke({
                        color: isHighlighted ? '#77FF4E' : '#FEE7AF',
                        width: 2,
                    }),
                });
            }
        });

        // Добавляем маршрутные линии
        routes.forEach(route => {
            const projCoords = route.pathCoords.map(coord =>
                projectCoordinates(coord, 'EPSG:4326', map.getView().getProjection().getCode())
            );
            const line = new LineString(projCoords);

            const feature = new Feature({
                geometry: line,
                routeId: route.id, // 👈 обязательно!
            });

            vectorSource.addFeature(feature);
        });


        map.addLayer(vectorLayer);

        // Явная очистка
        return () => {
            map.removeLayer(vectorLayer);
        };
    }, [routes, projectionType, highlightedRouteId]);




    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;
        const handleMouseMove = (e: MouseEvent) => {
            if (!map || !map.getTargetElement()) return;

            const mapRect = map.getTargetElement().getBoundingClientRect();


            // 👉 Обновляем elevation (если включён слой DTM)
            if (layerName === 'luna_wac_dtm') {
                const canvas = map.getTargetElement().querySelector('canvas');
                if (canvas) {
                    const ctx = (canvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: true });
                    if (ctx) {
                        try {
                            const pixelX = Math.round(e.clientX - mapRect.left);
                            const pixelY = Math.round(e.clientY - mapRect.top);

                            const offsets = [
                            { x: 0, y: 0 },   // Центральная точка
                            { x: 10, y: 0 },   // Восток
                            { x: -10, y: 0 },  // Запад
                            { x: 0, y: 10 },   // Юг
                            { x: 0, y: -10 }   // Север
                            ];

                            const elevations: number[] = offsets.map(offset => {
                                const x = pixelX + offset.x;
                                const y = pixelY + offset.y;
                                const data = ctx.getImageData(x, y, 1, 1).data;
                                return getElevationFromColor(data[0], data[1], data[2]) as number;
                            });

                            const centerElevation = elevations[0];
                            setElevation(centerElevation);

                            const distance = 500; 

                            
                        
                            const dz_dx = (elevations[1] - elevations[2]) / (2 * distance); // (восток - запад) / (2 * расстояние)
                            const dz_dy = (elevations[3] - elevations[4]) / (2 * distance);

                            const slopePercent = Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy) * 100;
                            const slopeDegrees = Math.atan(Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy)) * (180 / Math.PI);

                            const deltaEast = elevations[1] - centerElevation;  // Восток
                            const deltaWest = elevations[2] - centerElevation;  // Запад
                            const deltaSouth = elevations[3] - centerElevation; // Юг
                            const deltaNorth = elevations[4] - centerElevation; // Север
                            
                            
                            const deltas = [
                                { value: deltaEast, dir: '→' },  // Восток
                                { value: deltaWest, dir: '←' },  // Запад
                                { value: deltaSouth, dir: '↓' }, // Юг
                                { value: deltaNorth, dir: '↑' }  // Север
                            ];

                            deltas.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

                            

                            const mainSlopeDir = deltas[0].dir;

                            


                            setSlope({
                            percent: slopePercent,
                            degrees: slopeDegrees,
                            direction: mainSlopeDir
                                });

                            const data = ctx.getImageData(pixelX, pixelY, 1, 1).data;
                            setElevation(centerElevation);
                        } catch {
                            setElevation(null);
                            setSlope(null);
                        }
                    }
                }
            } else {
                setElevation(null);
                setSlope(null);
            }
        };


        document.addEventListener('mousemove', handleMouseMove);


        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, [layerName]);
    
    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        // Удалить все конфликты, если pendingZone очищен
        if (!pendingZone) {
            conflictOverlaysRef.current.forEach(overlay => {
                map.removeOverlay(overlay);
            });
            conflictOverlaysRef.current = [];
        }
    }, [pendingZone]);

    useEffect(() => {
        // Сначала очищаем предыдущую подсветку
        zones.forEach(zone => {
            const el = zone.overlay.getElement();
            el?.classList.remove('highlighted');
        });

        const selectedIds = new Set<number>();

        // 👇 Сначала добавляем подсветку по выделенному маршруту
        if (highlightedRouteId !== null) {
            const selectedRoute = routes.find(r => r.id === highlightedRouteId);
            if (selectedRoute) {
                selectedIds.add(selectedRoute.from.id);
                selectedIds.add(selectedRoute.to.id);
                selectedRoute.via?.forEach(v => selectedIds.add(v.id));
            }
        }

        // 👇 Потом добавляем из текущего строящегося маршрута
        if (newRoute.from) selectedIds.add(newRoute.from.id);
        if (newRoute.to) selectedIds.add(newRoute.to.id);
        newRoute.via.forEach(v => v && selectedIds.add(v.id));

        // Применяем класс `highlighted`
        zones.forEach(zone => {
            if (selectedIds.has(zone.id)) {
                const el = zone.overlay.getElement();
                if (el) {
                    requestAnimationFrame(() => el.classList.add('highlighted'));
                }
            }
        });
    }, [newRoute, zones, highlightedRouteId, routes]);


    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        const cleanupFns: (() => void)[] = [];

        if (mode === 'place' || mode === 'edit') {
            zones.forEach((zone) => {
                const el = zone.overlay.getElement();
                if (!el) return;
                if (mapInstance.current) {
                    conflictOverlaysRef.current.forEach(overlay => mapInstance.current!.removeOverlay(overlay));
                    conflictOverlaysRef.current = [];
                }
                const handleMouseDown = (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOriginalPosition(zone.coord);
                    setDraggedZoneId(zone.id);
                    setDragOverlay(zone.overlay);
                    setPendingZone({ ...zone });
                    setIsDragging(true);

                    if (dragPanInteractionRef.current) {
                        dragPanInteractionRef.current.setActive(false);
                    }
                };
                el.addEventListener('mousedown', handleMouseDown);
                cleanupFns.push(() => el.removeEventListener('mousedown', handleMouseDown));
            });
        }

        return () => {
            cleanupFns.forEach(fn => fn());
        };
    }, [zones, mode]);


    useEffect(() => {
        const updateAllModuleSizes = () => {
            const metersPerPixel = (window as any).resolution_meters_per_pixel;
            if (!metersPerPixel) return;

            const update = (zone: Zone) => {
                const overlayElement = zone.overlay.getElement();
                if (!overlayElement) return;
                const shapeEl = overlayElement.querySelector('.module-shape-wrapper') as HTMLElement;
                if (!shapeEl) return;

                const diameter = zone.radius * 2;
                const pxSize = diameter / metersPerPixel;
                shapeEl.style.width = `${pxSize}px`;
                shapeEl.style.height = `${pxSize}px`;
            };

            zones.forEach(update);
            if (pendingZone) update(pendingZone);
        };

        updateAllModuleSizes();

        const map = mapInstance.current;
        if (!map) return;

        map.on('moveend', updateAllModuleSizes);

        return () => {
            map.un('moveend', updateAllModuleSizes);
        };
    }, [zones, pendingZone]);


    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!map || !map.getTargetElement()) return;

            const mapRect = map.getTargetElement().getBoundingClientRect();
            const pixel = [e.clientX - mapRect.left, e.clientY - mapRect.top];
            const coord = map.getCoordinateFromPixel(pixel);
            const geo = unproject(coord);

            setCursorCoords({ lon: geo.lon, lat: geo.lat });

            if (conflictCircleRef.current && pendingZone) {
                const mapProjection = map.getView().getProjection().getCode();
                const projected = projectCoordinates(pendingZone.coord, 'EPSG:4326', mapProjection);
                conflictCircleRef.current.setPosition(projected);

                const metersPerPixel = (window as any).resolution_meters_per_pixel;
                if (metersPerPixel) {
                    const radius = pendingZone.radius;
                    const diameter = radius * 2;
                    const sizeInPixels = diameter / metersPerPixel;

                    const el = conflictCircleRef.current.getElement() as HTMLDivElement;
                    el.style.width = `${sizeInPixels}px`;
                    el.style.height = `${sizeInPixels}px`;
                }
            }


            if (isDragging && dragOverlay && pendingZone) {
                dragOverlay.setPosition(coord);
                setPendingZone((prev) =>
                    prev ? { ...prev, coord: [geo.lon, geo.lat] } : prev
                );
            }

            updateResolution();
        };



        const handleMouseUp = (e: MouseEvent) => {
            if (!isDragging || !dragOverlay) return;

            setIsDragging(false);

            if (dragPanInteractionRef.current) {
                dragPanInteractionRef.current.setActive(true);
            }

            if (pendingZone && draggedZoneId === null) {
                const conflict = hasConflict(pendingZone, zones);

                if (conflict) {
                    return;
                }


                return;
            }

            if (draggedZoneId !== null && pendingZone) {
                setPendingZone(prev => prev ? { ...prev, coord: [...prev.coord] } : null);

                return;
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOverlay, pendingZone, selectedModule, zones, projectionType]);


    
    type ModuleInfoVisibility = {
        [key: string]: boolean; 
    };

    const [isModuleInfoVisible, setIsModuleInfoVisible] = useState<ModuleInfoVisibility>({});
    // Function to toggle module information visibility
    const toggleModuleInfo = (id: string) => { // Change to number if IDs are numbers
        setIsModuleInfoVisible(prevState => ({
            ...prevState,
            [id]: !prevState[id]
        }));
    };
    

    return (
        <>
            <Header />
            <div className='main'>
                <div className='sideBar' style={{
                        display: 'flex',
                        flexDirection: 'column',
                        height: '93vh', 
                        overflow: 'hidden' 
                    }}>
                    <div className='buttons-tab'>
                        <div className="buttons-wrap">
                            <button onClick={() => setActiveTab('modules')} className={`${activeTab === 'modules' ? 'active' : ''}`}>Модули</button>
                            <button onClick={() => setActiveTab('routes')} className={`${activeTab === 'routes' ? 'active' : ''}`}>Маршруты</button>
                        </div>

                    </div>

                    {activeTab === 'modules' ? (
                        <div className='items' style={{
                                flex: 1, 
                                overflowY: 'auto', 
                                paddingRight: '8px' 
                            }}>
                            {initialModules.map(mod => (
                                <div className='module_div'>
                                <div className='module-buttons-container'>
                                    <button className='module_button'
                                        key={mod.id}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            if (!mapInstance.current || mode !== 'place' || pendingZone) return;
                                            const zone = pendingZone as Zone | null;
                                            if (zone) {
                                                mapInstance.current?.removeOverlay(zone.overlay);
                                            }
                                            setSelectedModule(mod);

                                            const container = document.createElement('div');


                                            const overlay = new Overlay({
                                                positioning: 'center-center',
                                                element: container,
                                                stopEvent: false,
                                            });

                                            updateOverlayClass(overlay, {
                                                pending: true,
                                                dragging: isDragging,
                                                type: mod.id
                                            });


                                            container.innerHTML = `
                                            <div class="module-shape-wrapper">${moduleShapes[mod.id]}</div>
                                            <div class="module-icon-wrapper">${moduleIcons[mod.id]}</div>
                                        `;




                                            mapInstance.current.addOverlay(overlay);
                                            const center = mapInstance.current.getView().getCenter();
                                            overlay.setPosition(center);

                                            requestAnimationFrame(() => {
                                                // 💡 Убедимся, что элемент отрендерен
                                                container.addEventListener('mousedown', (e) => {
                                                    if (!(mode === 'place' || mode === 'edit')) return;// 🔒
                                                    if (!pendingZone || overlay.getElement() !== e.currentTarget) return;
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setIsDragging(true);

                                                    if (dragPanInteractionRef.current) {
                                                        dragPanInteractionRef.current.setActive(false);
                                                    }
                                                });

                                            });



                                            const geo = unproject(center);
                                            const newZone: Zone = {
                                                id: Date.now(),
                                                type: mod.id,
                                                name: mod.name,
                                                radius: mod.radius,
                                                coord: [geo.lon, geo.lat],
                                                overlay,
                                            };

                                            setPendingZone(newZone);
                                            setDragOverlay(overlay);
                                            setIsDragging(true);

                                        }}






                                    >
                                        <span
                                            dangerouslySetInnerHTML={{ __html: moduleIcons[mod.id] }}
                                            style={{ marginRight: 6 }}
                                        />
                                        <p>{mod.name}</p>
                                    </button>

                                
                                    <button 
                                        className={`button_info ${isModuleInfoVisible[mod.id] ? 'expanded' : ''}`} 
                                        onClick={() => toggleModuleInfo(mod.id)}
                                        aria-label={isModuleInfoVisible[mod.id] ? "Скрыть" : "Подробнее"}
                                    >
                                        <svg 
                                            width="20" 
                                            height="20" 
                                            viewBox="0 0 24 24" 
                                            fill="none" 
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="arrow-icon"
                                        >
                                            <path 
                                                d="M7 10L12 15L17 10" 
                                                stroke="currentColor" 
                                                strokeWidth="2" 
                                                strokeLinecap="round" 
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    </button>
                                </div>
                                
                                {isModuleInfoVisible[mod.id] && (
                                    <div className='module_info'>
                                        <p>Описание: {mod.description}</p>
                                        <p>Дополнительная информация: {mod.additionalInfo}</p>
                                    </div>
                                )}

                                </div>

                                
                            ))}


                            
                        </div>
                    ) : (
                        <div className='items'>
                            {isCreatingRoute && (
                                <div style={{ marginTop: 10 }}>
                                    <div className='route_choise'>
                                        <label>Откуда:</label>
                                        <select
                                            value={newRoute.from?.id ?? ''}
                                            onChange={(e) => {
                                                const zone = zones.find(z => z.id === parseInt(e.target.value));
                                                setNewRoute(prev => ({
                                                    ...prev,
                                                    from: zone || null,
                                                    via: prev.via.map(v => (v?.id === zone?.id ? null : v)), // очищаем конфликтующие via
                                                }));
                                            }}

                                        >
                                            <option value="">--</option>
                                            {zones
                                                .filter(z => {
                                                    const usedIds = [
                                                        newRoute.to?.id,
                                                        ...newRoute.via.filter(Boolean).map(v => v?.id),
                                                    ];
                                                    return !usedIds.includes(z.id);
                                                })
                                                .map(z => (
                                                    <option key={z.id} value={z.id}>{z.name}</option>
                                                ))}
                                        </select>

                                    </div>

                                    <div className='route_choise'>
                                        <label>Промежуточные:</label>
                                        {newRoute.via.map((viaZone, index) => {
                                            const usedIds = [
                                                newRoute.from?.id,
                                                newRoute.to?.id,
                                                ...newRoute.via
                                                    .map((v, i) => (i === index ? null : v?.id))
                                                    .filter(Boolean),
                                            ];

                                            const availableZones = zones.filter(z => !usedIds.includes(z.id));

                                            // 🚫 Пропускаем рендер, если выбирать не из чего
                                            if (availableZones.length === 0 && !viaZone) return null;

                                            return (
                                                <div key={index}>
                                                    <select
                                                        value={viaZone?.id ?? ''}
                                                        onChange={(e) => {
                                                            const zone = zones.find(z => z.id === parseInt(e.target.value)) || null;

                                                            setNewRoute((prev) => {
                                                                let updatedVia = [...prev.via];
                                                                updatedVia[index] = zone;

                                                                // 🔁 Удалим null'ы в конце, НО оставим хотя бы один
                                                                while (updatedVia.length > 1 && updatedVia.at(-1) === null) {
                                                                    updatedVia.pop();
                                                                }

                                                                // 🔒 Гарантируем хотя бы один пустой селект
                                                                const hasEmpty = updatedVia.includes(null);
                                                                const usedIds = [
                                                                    prev.from?.id,
                                                                    prev.to?.id,
                                                                    ...updatedVia.filter(Boolean).map(z => z!.id),
                                                                ];
                                                                const available = zones.filter(z => !usedIds.includes(z.id));

                                                                if (!hasEmpty && available.length > 0) {
                                                                    updatedVia.push(null);
                                                                }

                                                                return { ...prev, via: updatedVia };
                                                            });
                                                        }}


                                                    >
                                                        <option value="">--</option>
                                                        {availableZones.map((z) => (
                                                            <option key={z.id} value={z.id}>{z.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            );
                                        })}

                                    </div>


                                    <div className='route_choise'>
                                        <label>Куда:</label>
                                        <select
                                            value={newRoute.to?.id ?? ''}
                                            onChange={(e) => {
                                                const zone = zones.find(z => z.id === parseInt(e.target.value));
                                                setNewRoute(prev => ({
                                                    ...prev,
                                                    to: zone || null,
                                                    via: prev.via.map(v => (v?.id === zone?.id ? null : v)), // тоже очищаем
                                                }));
                                            }}

                                        >
                                            <option value="">--</option>
                                            {zones
                                                .filter(z => {
                                                    const usedIds = [
                                                        newRoute.from?.id,
                                                        ...newRoute.via.filter(Boolean).map(v => v?.id),
                                                    ];
                                                    return !usedIds.includes(z.id);
                                                })
                                                .map(z => (
                                                    <option key={z.id} value={z.id}>{z.name}</option>
                                                ))}
                                        </select>

                                    </div>

                                    <button
                                        className='empty_button'
                                        onClick={() => {
                                            buildRoute();
                                            setIsCreatingRoute(false);
                                        }}
                                    >
                                        Добавить
                                    </button>
                                </div>
                            )}

                            <div className="buttons-wrap new_route_button">

                                <button
                                    className=''
                                    onClick={handleNewRoute}>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M4 14.6667C5.10457 14.6667 6 13.7713 6 12.6667C6 11.5622 5.10457 10.6667 4 10.6667C2.89543 10.6667 2 11.5622 2 12.6667C2 13.7713 2.89543 14.6667 4 14.6667Z" stroke="#0A0A0A" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" />
                                        <path d="M6 12.6666H11.6667C12.2855 12.6666 12.879 12.4208 13.3166 11.9832C13.7542 11.5456 14 10.9521 14 10.3333C14 9.71441 13.7542 9.12092 13.3166 8.68334C12.879 8.24575 12.2855 7.99992 11.6667 7.99992H4.33333C3.71449 7.99992 3.121 7.75409 2.68342 7.3165C2.24583 6.87892 2 6.28542 2 5.66659C2 5.04775 2.24583 4.45425 2.68342 4.01667C3.121 3.57908 3.71449 3.33325 4.33333 3.33325H10" stroke="#0A0A0A" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" />
                                        <path d="M12 5.33325C13.1046 5.33325 14 4.43782 14 3.33325C14 2.22868 13.1046 1.33325 12 1.33325C10.8954 1.33325 10 2.22868 10 3.33325C10 4.43782 10.8954 5.33325 12 5.33325Z" stroke="#0A0A0A" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>
                                    Новый маршрут
                                </button>
                            </div>
                            {routes.map(route => (
                                <div className={`route_item ${highlightedRouteId ? 'active' : ''}`}
                                    key={route.id}

                                >
                                    <span
                                        style={{ cursor: 'pointer', flexGrow: 1 }}
                                        onClick={() =>
                                            setHighlightedRouteId(prev =>
                                                prev === route.id ? null : route.id
                                            )
                                        }
                                    >
                                        {route.from.name} ➡️ {route.to.name} ({route.length.toFixed(1)} м)
                                    </span>

                                    <button
                                        onClick={() => {
                                            setRoutes(prev => prev.filter(r => r.id !== route.id));
                                            if (highlightedRouteId === route.id) {
                                                setHighlightedRouteId(null);
                                            }
                                        }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#f44336',
                                            cursor: 'pointer',
                                            fontSize: '16px'
                                        }}
                                        title="Удалить маршрут"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}

                        </div>
                    )}
                </div>


                <div
                    style={{
                        position: 'absolute',
                        bottom: 50,
                        right: 10,
                        zIndex: 999,
                        background: 'rgba(0,0,0,0.6)',
                        padding: 10,
                        borderRadius: 8,
                    }}
                >
                    <label style={{ color: '#fff', fontWeight: 'bold', marginRight: 8 }}>Проекция:</label>
                    <select
                        value={projectionType}
                        onChange={(e) => setProjectionType(e.target.value as 'cylindrical' | 'orthographic')}
                    >
                        <option value="cylindrical">🟡 Cylindrical</option>
                        <option value="orthographic">⚪ Orthographic</option>
                    </select>

                    {projectionType === 'orthographic' && (
                        <div style={{ marginTop: 10, color: '#fff' }}>
                            <div>
                                Center Lon:{' '}
                                <input
                                    type="number"
                                    value={centerLon}
                                    step={0.01}
                                    onChange={(e) => setCenterLon(parseFloat(e.target.value))}
                                />
                            </div>
                            <div style={{ marginTop: 4 }}>
                                Center Lat:{' '}
                                <input
                                    type="number"
                                    value={centerLat}
                                    step={0.01}
                                    onChange={(e) => setCenterLat(parseFloat(e.target.value))}
                                />
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: 20, color: '#fff' }}>
                        <div>Lon: {cursorCoords.lon.toFixed(2)}, Lat: {cursorCoords.lat.toFixed(2)}</div>
                        <div>Elevation: {elevation ? `${elevation.toFixed(2)} meters` : 'Loading...'}</div>
                        <div>Slope: {slope ? `${slope.percent.toFixed(1)} % ${slope.degrees.toFixed(1)}° ${slope?.direction}` : 'Loading...'}</div>
                    </div>
                </div>





                <div
                    style={{
                        position: 'absolute',
                        bottom: 10,
                        right: 20,
                        zIndex: 999,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        pointerEvents: 'none',
                    }}
                >
                    <div
                        style={{
                            width: '200px',
                            height: '4px',
                            backgroundColor: 'white',
                            boxShadow: '0 0 2px black',
                            marginBottom: '4px',
                        }}
                    />
                    <div
                        id="scale-bar-label"
                        style={{
                            color: 'white',
                            fontSize: '14px',
                            textShadow: '0 0 2px black',
                        }}
                    >
                        {/* Значение будет установлено динамически */}
                    </div>
                </div>


                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
                    {/* Правая панель: смена слоя + режим размещения */}
                    <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowLayerMenu(!showLayerMenu)}
                                style={{
                                    background: '#333',
                                    border: 'none',
                                    color: '#fff',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '20px',
                                }}
                            >
                                🗺️
                            </button>

                            {showLayerMenu && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '110%',
                                        right: 0,
                                        background: '#444',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        color: 'white',
                                        minWidth: '160px',
                                    }}
                                >
                                    <div
                                        onClick={() => {
                                            setLayerName('luna_wac_global');
                                            setShowLayerMenu(false);
                                        }}
                                        style={{ padding: '5px', cursor: 'pointer' }}
                                    >
                                        🌕 Обычная карта
                                    </div>
                                    <div
                                        onClick={() => {
                                            setLayerName('luna_wac_dtm');
                                            setShowLayerMenu(false);
                                        }}
                                        style={{ padding: '5px', cursor: 'pointer' }}
                                    >
                                        🛰️ Спектральная карта
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Кнопка размещения/редактирования */}
                        <button
                            onClick={() => setMode(mode === 'place' ? 'view' : 'place')}
                            style={{
                                marginTop: 8,
                                background: mode === 'place' ? '#4caf50' : '#555',
                                color: '#fff',
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '16px',
                                display: 'block',
                                width: '100%'
                            }}
                        >
                            {mode === 'place' ? '🚧' : '➕'}
                        </button>
                    </div>

                </div>

                
                
                {pendingZone && (
                    <div className='submit'
                        style={{
                            position: 'absolute',
                            bottom: 20,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 1100,
                            background: '#fff',
                            padding: 20,
                            borderRadius: 8,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        }}
                    >
                        <p>
                            Подтвердить размещение модуля <strong>{pendingZone.name}</strong> на координатах{' '}
                            Lon: {pendingZone.coord[0].toFixed(2)}, Lat: {pendingZone.coord[1].toFixed(2)}?
                        </p>

                        


                        <button
                            className={isConflict ? 'conflict' : ''}
                            disabled={isConflict}
                            onClick={() => {
                                updateOverlayClass(pendingZone.overlay, {
                                    pending: false,
                                    dragging: false,
                                    type: pendingZone.type,
                                });

                                setZones((prev) => {
                                    if (draggedZoneId !== null) {
                                        // Обновляем существующий модуль
                                        return prev.map((z) =>
                                            z.id === draggedZoneId ? { ...pendingZone, coord: [...pendingZone.coord] } : z
                                        );
                                    }
                                    // Добавляем новый модуль
                                    return [...prev, pendingZone];
                                });

                                // Очищаем круги конфликтов
                                conflictOverlaysRef.current.forEach(overlay => mapInstance.current?.removeOverlay(overlay));
                                conflictOverlaysRef.current = [];

                                setPendingZone(null);
                                setDragOverlay(null);
                                setSelectedModule(null);
                                setDraggedZoneId(null);
                                setIsDragging(false);
                            }}
                        >
                            ✅ Подтвердить
                        </button>
                        <button
                            onClick={() => {
                                updateOverlayClass(pendingZone.overlay, {
                                    pending: false,
                                    dragging: false,
                                });

                                const overlay = pendingZone.overlay;

                                // Если это новый модуль, удаляем оверлей
                                if (draggedZoneId === null && overlay) {
                                    mapInstance.current?.removeOverlay(overlay);
                                }

                                // Очищаем круги конфликтов
                                conflictOverlaysRef.current.forEach(overlay => mapInstance.current?.removeOverlay(overlay));
                                conflictOverlaysRef.current = [];

                                // Восстанавливаем позицию для перетаскиваемого модуля
                                if (draggedZoneId !== null && originalPosition && overlay && mapInstance.current) {
                                    const mapProjection = mapInstance.current.getView().getProjection().getCode();
                                    const projectedPosition = mapProjection === 'EPSG:4326'
                                        ? originalPosition
                                        : transform(originalPosition, 'EPSG:4326', mapProjection) as [number, number];

                                    if (!mapInstance.current?.getOverlays().getArray().includes(overlay)) {
                                        mapInstance.current?.addOverlay(overlay);
                                    }

                                    overlay.setPosition(projectedPosition);

                                    setZones((prev) =>
                                        prev.map((z) =>
                                            z.id === draggedZoneId
                                                ? { ...z, coord: originalPosition, overlay }
                                                : z
                                        )
                                    );
                                }

                                setPendingZone(null);
                                setDragOverlay(null);
                                setDraggedZoneId(null);
                                setSelectedModule(null);
                                setIsDragging(false);
                                setOriginalPosition(null);
                            }}
                        >
                            ❌ Отмена
                        </button>



                    </div>
                )}

                <div className='save_plan_button' style={{ marginTop: 10 }}>
                    <button onClick={exportPlan}>💾 Сохранить план</button>
                    <input
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                            if (e.target.files?.[0]) {
                                importPlan(e.target.files[0]);
                            }
                        }}
                        style={{ marginTop: 6 }}
                    />
                </div>


                <div
                    ref={mapRef}
                    className='map'
                />
            </div></>
    );
}