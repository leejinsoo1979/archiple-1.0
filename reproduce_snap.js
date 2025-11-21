
// Mock Vector2 class
class Vector2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    subtract(v) { return new Vector2(this.x - v.x, this.y - v.y); }
    add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
    multiply(scalar) { return new Vector2(this.x * scalar, this.y * scalar); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    lengthSq() { return this.x * this.x + this.y * this.y; } // Using lengthSq as in my fix I used lengthSquared but let's check logic
    lengthSquared() { return this.x * this.x + this.y * this.y; }
    distanceTo(v) { return Math.sqrt(Math.pow(this.x - v.x, 2) + Math.pow(this.y - v.y, 2)); }
}

// Mock Wall and Point
const walls = [{ id: 'w1', startPointId: 'p1', endPointId: 'p2' }];
const pointMap = new Map([
    ['p1', { x: 0, y: 0 }],
    ['p2', { x: 1000, y: 0 }]
]);

// Snap Logic (copied from SnapService)
function snapToWall(position, threshold) {
    let nearestWall = null;
    let nearestPoint = null;
    let minDistance = threshold;

    for (const wall of walls) {
        const startPt = pointMap.get(wall.startPointId);
        const endPt = pointMap.get(wall.endPointId);

        const start = new Vector2(startPt.x, startPt.y);
        const end = new Vector2(endPt.x, endPt.y);
        const wallVec = end.subtract(start);
        const wallLengthSq = wallVec.lengthSquared();

        if (wallLengthSq === 0) continue;

        // Calculate projection of position onto wall vector
        const toMouse = position.subtract(start);
        const t = Math.max(0, Math.min(1, toMouse.dot(wallVec) / wallLengthSq));

        const closestPoint = start.add(wallVec.multiply(t));
        const distance = position.distanceTo(closestPoint);

        console.log(`Testing pos (${position.x}, ${position.y}): t=${t}, closest=(${closestPoint.x}, ${closestPoint.y}), dist=${distance}`);

        if (distance < minDistance) {
            minDistance = distance;
            nearestWall = wall;
            nearestPoint = closestPoint;
        }
    }

    return nearestPoint;
}

// Test Cases
console.log('--- Test 1: Middle of wall ---');
const p1 = new Vector2(500, 10); // 10mm away from center
const r1 = snapToWall(p1, 150);
console.log('Result 1:', r1); // Should be (500, 0)

console.log('\n--- Test 2: Near start ---');
const p2 = new Vector2(100, 50); // 50mm away
const r2 = snapToWall(p2, 150);
console.log('Result 2:', r2); // Should be (100, 0)

console.log('\n--- Test 3: Too far ---');
const p3 = new Vector2(500, 200); // 200mm away (threshold 150)
const r3 = snapToWall(p3, 150);
console.log('Result 3:', r3); // Should be null

console.log('\n--- Test 4: Past end (clamped) ---');
const p4 = new Vector2(1200, 10);
const r4 = snapToWall(p4, 150);
console.log('Result 4:', r4); // Should be (1000, 0) because of clamping t to 1
