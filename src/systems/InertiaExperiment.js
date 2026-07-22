import * as THREE from 'three';

/**
 * Builds a table and a hollow glass tumbler for the inertia of rest experiment.
 */
export function createInertiaSetup() {
  const group = new THREE.Group();

  // 1. Table
  const tableGroup = new THREE.Group();
  
  // Table Top
  const tableTopGeo = new THREE.BoxGeometry(10, 0.5, 10);
  const tableTopMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 }); // Brown wood
  const tableTop = new THREE.Mesh(tableTopGeo, tableTopMat);
  tableTop.position.set(0, 4, 0); // Table is 4 units high
  tableTop.receiveShadow = true;
  tableTop.castShadow = true;
  tableGroup.add(tableTop);

  // Table Legs
  const legGeo = new THREE.CylinderGeometry(0.2, 0.2, 4);
  const positions = [
    [-4.5, 2, -4.5],
    [ 4.5, 2, -4.5],
    [-4.5, 2,  4.5],
    [ 4.5, 2,  4.5]
  ];
  positions.forEach(pos => {
    const leg = new THREE.Mesh(legGeo, tableTopMat);
    leg.position.set(...pos);
    leg.receiveShadow = true;
    leg.castShadow = true;
    tableGroup.add(leg);
  });
  group.add(tableGroup);

  // 2. Glass Tumbler (Hollow)
  const glassGroup = new THREE.Group();
  
  // Glass properties
  const glassHeight = 2.5;
  const glassRadius = 1.2;
  const glassThickness = 0.1;

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.3,
    roughness: 0.1,
    transmission: 0.9,
    thickness: 0.5,
    side: THREE.DoubleSide
  });

  // Glass Wall (Open ended cylinder)
  const wallGeo = new THREE.CylinderGeometry(glassRadius, glassRadius, glassHeight, 32, 1, true);
  const wall = new THREE.Mesh(wallGeo, glassMat);
  wall.position.y = glassHeight / 2;
  wall.castShadow = true;
  glassGroup.add(wall);

  // Glass Bottom (Disc)
  const bottomGeo = new THREE.CylinderGeometry(glassRadius, glassRadius, glassThickness, 32);
  const bottom = new THREE.Mesh(bottomGeo, glassMat);
  bottom.position.y = glassThickness / 2;
  glassGroup.add(bottom);

  // Position Glass on center of table
  glassGroup.position.set(0, 4.25, 0); 
  group.add(glassGroup);

  // Metadata for interactions
  group.userData.setup = {
    glassTopY: 4.25 + glassHeight, // Height where the book should rest
    glassCenterX: 0,
    glassCenterZ: 0,
    glassRadius: glassRadius
  };

  return group;
}
