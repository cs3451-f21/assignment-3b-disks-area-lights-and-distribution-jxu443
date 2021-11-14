function lessEpsilon(num: number): boolean{ 
    return Math.abs(num) < 1e-10; 
} 
function greaterEpsilon(num: number): boolean{ 
    return Math.abs(num) > 1e-10; 
} 
  
// classes from the Typescript RayTracer sample
export class Vector {
    constructor(public x: number,
                public y: number,
                public z: number) {
    }
    static times(k: number, v: Vector) { return new Vector(k * v.x, k * v.y, k * v.z); }
    static minus(v1: Vector, v2: Vector) { return new Vector(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z); }
    static plus(v1: Vector, v2: Vector) { return new Vector(v1.x + v2.x, v1.y + v2.y, v1.z + v2.z); }
    static dot(v1: Vector, v2: Vector) { return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z; }
    static mag(v: Vector) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
    static norm(v: Vector) {
        var mag = Vector.mag(v);
        var div = (mag === 0) ? Infinity : 1.0 / mag;
        return Vector.times(div, v);
    }
    static cross(v1: Vector, v2: Vector) {
        return new Vector(v1.y * v2.z - v1.z * v2.y,
                          v1.z * v2.x - v1.x * v2.z,
                          v1.x * v2.y - v1.y * v2.x);
    }
}

export class Color {
    constructor(public r: number,
                public g: number,
                public b: number) {
    }
    static scale(k: number, v: Color) { return new Color(k * v.r, k * v.g, k * v.b); }
    static plus(v1: Color, v2: Color) { return new Color(v1.r + v2.r, v1.g + v2.g, v1.b + v2.b); }
    static times(v1: Color, v2: Color) { return new Color(v1.r * v2.r, v1.g * v2.g, v1.b * v2.b); }
    static white = new Color(1.0, 1.0, 1.0);
    static grey = new Color(0.5, 0.5, 0.5);
    static black = new Color(0.0, 0.0, 0.0);
    static lightness(c: Color) { return Math.sqrt(c.r * c.r + c.g * c.g + c.b * c.b); }
    static toDrawingColor(c: Color) {
        var legalize = (d: number) => d > 1 ? 1 : d;
        return {
            r: Math.floor(legalize(c.r) * 255),
            g: Math.floor(legalize(c.g) * 255),
            b: Math.floor(legalize(c.b) * 255)
        }
    }
}

interface Ray {
    start: Vector;
    dir: Vector;
}

// a suggested interface for jitter samples
interface Sample {
    s: number,
    t: number
}

// A class for our application state and functionality
class RayTracer {
    // the constructor paramater "canv" is automatically created 
    // as a property because the parameter is marked "public" in the 
    // constructor parameter
    // canv: HTMLCanvasElement
    //
    // rendering context for the canvas, also public
    // ctx: CanvasRenderingContext2D

    // initial color we'll use for the canvas
    canvasColor = "lightyellow"

    canv: HTMLCanvasElement
    ctx: CanvasRenderingContext2D 

    // some things that will get specified by user method calls
    enableShadows = true
    jitter = false
    samples = 1

    // user method calls set these, for the optional parts of the assignment
    enableBlur = false
    enableReflections = false
    enableDepth = false

    // if you are doing reflection, set some max depth here
    maxDepth = 5;

    //new class variables 
    geos: Geo[] = [];
    lights: Light[] = [];
    areaLights: AreaLight[] = []
    Ia: Color = new Color(0,0,0);
    backgroundColor = new Color(0, 0, 0);
    
    fov: number = 90 //in degree
    cameraPos: Vector = new Vector(0,0,0); 
    lookAtVec: Vector = new Vector(0,0,1);  
    upVec: Vector = new Vector(0,1,0); 

    constructor (div: HTMLElement,
        public width: number, public height: number, 
        public screenWidth: number, public screenHeight: number) {

        // let's create a canvas and to draw in
        this.canv = document.createElement("canvas");
        this.ctx = this.canv.getContext("2d")!;
        if (!this.ctx) {
            console.warn("our drawing element does not have a 2d drawing context")
            return
        }
        
        div.appendChild(this.canv);

        this.canv.id = "main";
        this.canv.style.width = this.width.toString() + "px";
        this.canv.style.height = this.height.toString() + "px";
        this.canv.width  = this.width;
        this.canv.height = this.height;
    }

    // HINT: SUGGESTED INTERNAL METHOD
    // create an array of samples (size this.samples ^ 2) in the range 0..1, which can
    // be used to create a distriubtion of rays around a single eye ray or light ray.
    // The distribution would use the jitter parameters to create either a regularly spaced or 
    // randomized set of samples.
    private createDistribution(): Sample[] {
        let step = 2 / this.samples
        var res: Sample[] = []
        for (let i = -1; greaterEpsilon(1-i); i += step) {
            for (let j = -1; greaterEpsilon(1-j) ; j += step) {
                if (this.jitter) { 
                    let curr: Sample = {
                        s: i + step * Math.random(),
                        t: j + step * Math.random(),
                    };
                    res.push(curr)
                } else {
                    let curr: Sample = {
                        s: i + step * 0.5,
                        t: j + step * 0.5,
                    };
                    res.push(curr)
                }
            }
        }
        return res
    }

    // HINT: SUGGESTED BUT NOT REQUIRED, INTERNAL METHOD
    // like traceRay, but returns on first hit. More efficient than traceRay for detecting if "in shadow"
    private testRay(ray: Ray) {
    }

    // NEW COMMANDS FOR PART B

    // create a new disk 
    // 
    // NOTE:  the final vx, vy, vz are only needed for optional motion blur part, 
    // and are the velocity of the object. The object is moving from x,y,z - vx,vy,vz to x,y,z + vx,vy,vz 
    // during the time interval being rendered.
    new_disk (x: number, y: number, z: number, radius: number, 
              nx: number, ny: number, nz: number, dr: number, dg: number, db: number, 
              k_ambient: number, k_specular: number, specular_pow: number,
              vx?: number, vy?: number, vz?: number) {
                let disk = new Disk(radius, new Vector(x,y,z), new Vector(nx, ny, nz),
                 new Color(dr, dg, db), k_ambient, k_specular, specular_pow)
                this.geos.push(disk)
    }

    // create a new area light source
    area_light (r: number, g: number, b: number, x: number, y: number, z: number, 
                ux: number, uy: number, uz: number, vx: number, vy: number, vz: number) {
                    let currL: AreaLight = {
                        center: new Vector(x, y, z),
                        color: new Color(r, g, b),
                        u: new Vector(ux, uy, uz),
                        v: new Vector(vx, vy, vz),
                    };
                    this.areaLights.push(currL);
    }

    //When level = n, shoot n^2 rays per pixel
    set_sample_level (num: number) {
        this.samples = num
    }

    jitter_on() {
        this.jitter = true
    }

    jitter_off() {
        this.jitter = false
    }

    // turn reflection on or off for extra credit reflection part
    reflection_on() {
        this.enableReflections = true
    }

    reflection_off() {
        this.enableReflections = false
    }

    // turn motion blur on or off for extra credit motion blur part
    blur_on() {
        this.enableBlur = true
    }

    blur_off() {
        this.enableBlur = false
    }

    // turn depth of field on or off for extra credit depth of field part
    depth_on() {
        this.enableDepth = true
    }

    depth_off() {
        this.enableDepth = false
    }

    // COMMANDS FROM PART A

    // clear out all scene contents
    reset_scene() {
        this.set_fov(90);
        this.set_eye(0,0,0,0,0,-1,0,1,0);
        this.geos = [];
        this.lights = [];
        this.areaLights = [];
        this.Ia = new Color(0,0,0);
        this.set_background(1,1,1); // something
    }

    // create a new point light source
    new_light (r: number, g: number, b: number, x: number, y: number, z: number) {
        let currL: Light = {
            pos: new Vector(x, y, z),
            color: new Color(r, g, b)
        };
        this.lights.push(currL);
    }

    // set value of ambient light source
    ambient_light (r: number, g: number, b: number) {
        this.Ia = new Color(r,g,b);
    }

    // set the background color for the scene
    set_background (r: number, g: number, b: number) {
        this.backgroundColor = new Color(r, g, b);
    }

    // set the field of view
    DEG2RAD = (Math.PI/180)

    set_fov (theta: number) {
        this.fov = theta
    }

    // // set the position of the virtual camera/eye
    // set_eye_position (x: number, y: number, z: number) {
    //     this.scene.camera.pos = new Vector(x,y,z)
    // }

    // set the virtual camera's viewing direction
    set_eye(x1: number, y1: number, z1: number, 
            x2: number, y2: number, z2: number, 
            x3: number, y3: number, z3: number) {
                this.cameraPos = new Vector(x1, y1, z1) 
                let lookUpPos = new Vector(x2, y2, z2)
                this.lookAtVec = Vector.norm(Vector.minus(this.cameraPos, lookUpPos))
                this.upVec = Vector.norm(new Vector(x3, y3, z3))
    }

    // create a new sphere.
    //
    // NOTE:  the final vx, vy, vz are only needed for optional motion blur part, 
    // and are the velocity of the object. The object is moving from x,y,z - vx,vy,vz to x,y,z + vx,vy,vz 
    // during the time interval being rendered.

    new_sphere (x: number, y: number, z: number, radius: number, 
                dr: number, dg: number, db: number, 
                k_ambient: number, k_specular: number, specular_pow: number, 
                vx?: number, vy?: number, vz?: number) {
                    let sp = new Sphere(radius, new Vector(x,y,z), new Color(dr, dg, db), 
                                k_ambient, k_specular, specular_pow)
                    this.geos.push(sp)
    }

    // INTERNAL METHODS YOU MUST IMPLEMENT

    // create an eye ray based on the current pixel's position
    private eyeRay(i: number, j: number): Ray {
        let d = 1/Math.tan(this.fov*this.DEG2RAD/2)
        let us = -1 + 2*i/this.screenWidth // left to right
        let u = Vector.cross(this.upVec, this.lookAtVec) //y corss z = x
        let vs = 1 - 2*j/this.screenHeight * this.height/ this.width

        //console.log(this.lookAtVec, this.upVec)
        // -dW + usU + vsV
        let dw = Vector.times(-d, this.lookAtVec)
        let usU = Vector.times(us, u)
        let vsV = Vector.times(vs, this.upVec)
        let dir = Vector.plus(Vector.plus(dw, usU), vsV)
        //console.log(dir)
        let ray: Ray = {
            start: this.cameraPos,
            dir: Vector.norm(dir)
        };
        return ray 
    }

    //ToDo: reflection recursion
    private traceRay(ray: Ray, depth: number = 0): Color {
        if (this.geos.length == 0) {
            return this.backgroundColor
        }
        var t = Number.MAX_VALUE;
        var geoIdx = -1;
        // find the closest valid time t
        for (let i = 0; i < this.geos.length; i++) {
            let currGeo = this.geos[i];
            let time = currGeo.collide(ray)

            if (!Number.isNaN(time)) {
                if (time < t) {
                    t = time;
                    geoIdx = i
                }
            }
        }

        if (geoIdx < 0) { // no collision
            return this.backgroundColor;
        } else {
            return this.getColor(t, ray, this.geos[geoIdx])
        }
    }

    getColor(t: number, ray: Ray, geo: Geo): Color {
        let pos = Vector.plus(ray.start,Vector.times(t, ray.dir))
        var diffuseTermSum: Color = Color.black
        var specularTermSum: Color = Color.black
        let distr: Sample[] = this.createDistribution()
        
        this.areaLights.forEach(aLight => {
            var dTerm: Color = Color.black
            var sTerm: Color = Color.black
            distr.forEach(sp => {
                //p = c + su + tv
                let lightPos = Vector.plus(Vector.plus(aLight.center, Vector.times(sp.s, aLight.u)), Vector.times(sp.t, aLight.v))
                let [diffse, specular] = this.getColorPtLight(ray.start, lightPos, pos, geo, aLight.color)
                
                if (!this.isBlocked(lightPos, pos)) {
                    dTerm = Color.plus(dTerm, diffse)
                    if (Color.lightness(sTerm) < Color.lightness(specular)) {
                        sTerm = specular //pick the max specular term
                    }
                }
            });
            dTerm = Color.scale(1/this.samples**2, dTerm) //average the diffuse term
            
            diffuseTermSum = Color.plus(diffuseTermSum, dTerm)
            specularTermSum = Color.plus(specularTermSum, sTerm)
        });
        
        this.lights.forEach(light => { 
            if (!this.isBlocked(light.pos, pos)) {
                let [dTerm, sTerm] = this.getColorPtLight(ray.start, light.pos, pos, geo, light.color)
                diffuseTermSum = Color.plus(diffuseTermSum, dTerm)
                specularTermSum = Color.plus(specularTermSum, sTerm)
            }
        });
        
        //sums up everything
        var sum: Color = Color.black
        sum = Color.plus(sum, Color.times(Color.scale(geo.ka, this.Ia), geo.kd))
        sum = Color.plus(sum, diffuseTermSum)
        sum = Color.plus(sum, specularTermSum)
        
        return sum;
    }

    getColorPtLight(eyePos: Vector, lightPos: Vector, pos: Vector, geo: Geo, lightColor: Color): [Color, Color] {
        let N = geo.getNorm(pos)
        let V = Vector.norm(Vector.minus(eyePos,pos))
        let Li = Vector.norm(Vector.minus(lightPos, pos))
        //R = 2 * N . L * N - L
        let Ri = Vector.norm(Vector.minus(Vector.times(2*Vector.dot(N, Li), N), Li))
        let diffuseTerm = Vector.dot(N, Li) < 0? new Color(0,0,0): 
                            Color.scale(Vector.dot(N, Li), Color.times(lightColor, geo.kd)) 
        let specularTerm = Vector.dot(Ri, V) < 0? new Color(0,0,0): 
                            Color.scale(geo.ks * Math.pow(Vector.dot(Ri, V), geo.specular_pow), lightColor)
        return [diffuseTerm, specularTerm]
    }

    isBlocked(lightPos: Vector, pos: Vector): boolean {
        //check any geo in between pos and lightPos
        //let direction = Vector.norm(Vector.minus(lightPos, pos))
        let direction = Vector.minus(lightPos, pos)
        let currRay: Ray = {
            start: Vector.plus(pos, Vector.times(0.001, Vector.norm(direction))),
            dir: direction
        }
        let res: boolean = false;
        //let timeToLight = Vector.minus(lightPos, currRay.start).x / currRay.dir.x
        this.geos.forEach (geo => {
            let timeX = geo.collide(currRay)
            if (!Number.isNaN(timeX) && timeX < 1) {
                res = true;
            }
        })
        return res;
    }


    // draw_scene is provided to create the image from the ray traced colors. 
    // 1. it renders 1 line at a time, and uses requestAnimationFrame(render) to schedule 
    //    the next line.  This causes the lines to be displayed as they are rendered.
    // 2. it uses the additional constructor parameters to allow it to render a  
    //    smaller # of pixels than the size of the canvas
    //
    // YOU WILL NEED TO MODIFY draw_scene TO IMPLEMENT DISTRIBUTION RAY TRACING!
    //
    // NOTE: this method now has three optional parameters that are used for the depth of
    // field extra credit part. You will use these to modify this routine to adjust the
    // eyeRays to create the depth of field effect.
    draw_scene(lensSize?: number, depth1?: number, depth2?: number) {

        // rather than doing a for loop for y, we're going to draw each line in
        // an animationRequestFrame callback, so we see them update 1 by 1
        var pixelWidth = this.width / this.screenWidth;
        var pixelHeight = this.height / this.screenHeight;
        var y = 0;
        
        this.clear_screen();

        var renderRow = () => {
            for (var x = 0; x < this.screenWidth; x++) {
                // HINT: if you implemented "createDistribution()" above, you can use it here
                let vecs = this.createDistribution()
                
                // HINT: you will need to loop through all the rays, if distribution is turned
                // on, and compute an average color for each pixel.
                var c = Color.black
                vecs.forEach(sp => {
                    let disX = x + pixelWidth/2 * sp.s
                    let disY = y + pixelHeight/2 * sp.t
                    let ray = this.eyeRay(disX, disY);
                    c = Color.plus(c, this.traceRay(ray))
                })
                var c = Color.scale(1/this.samples**2, c);
    
                var color = Color.toDrawingColor(c)
                this.ctx.fillStyle = "rgb(" + String(color.r) + ", " + String(color.g) + ", " + String(color.b) + ")";
                this.ctx.fillRect(x * pixelWidth, y * pixelHeight, pixelWidth+1, pixelHeight+1);
            }
            
            // finished the row, so increment row # and see if we are done
            y++;
            if (y < this.screenHeight) {
                // finished a line, do another
                requestAnimationFrame(renderRow);            
            } else {
                console.log("Finished rendering scene")
            }
        }

        renderRow();
    }

    clear_screen() {
        this.ctx.fillStyle = this.canvasColor;
        this.ctx.fillRect(0, 0, this.canv.width, this.canv.height);

    }
}
export {RayTracer}

interface Light {
    pos: Vector,
    color: Color
}

interface AreaLight {
    center: Vector,
    color: Color,
    u: Vector,
    v: Vector,
}

class Geo {
    radius: number;
    center: Vector;
    kd: Color;
    ka: number; //k_ambient
    ks: number; //k_specular
    specular_pow: number; //pi
    // vx, vy, vz optional params for motion blur

    constructor(r: number, center: Vector, kd: Color, 
        k_ambient: number, k_specular: number, specular_pow: number) {
        this.radius = r;
        this.center = center;
        this.kd = kd
        this.ka = k_ambient;
        this.ks = k_specular;
        this.specular_pow = specular_pow;
    }

    collide(ray: Ray): number{return NaN;}
    getNorm(pos: Vector): Vector {return new Vector(0,0,0)}

}

class Disk extends Geo{
    norm: Vector;

    constructor(r: number, center: Vector, norm: Vector, kd: Color, 
        k_ambient: number, k_specular: number, specular_pow: number) {
        super(r, center, kd, k_ambient, k_specular, specular_pow)
        this.norm = norm
    }

    collide(ray: Ray): number {
        let t = Vector.dot(Vector.minus(this.center, ray.start), this.norm) / Vector.dot(ray.dir, this.norm)
        let mag = Vector.mag(Vector.minus(Vector.plus(ray.start, Vector.times(t, ray.dir)), this.center))
        return (t >= 0 && mag <= this.radius)? t: NaN;
    }

    getNorm(pos: Vector): Vector {
        return this.norm
    }

}

class Sphere extends Geo {
    constructor(r: number, center: Vector, kd: Color, 
        k_ambient: number, k_specular: number, specular_pow: number) {
            super(r, center, kd, k_ambient, k_specular, specular_pow)
    }

    collide(ray: Ray): number {
        let d = ray.dir
        let c = this.center
        let e = ray.start
        let R = this.radius
        //(d⋅(e−c))2−(d⋅d)((e−c)⋅(e−c)−R2)
        let e_c = Vector.minus(e,c)      
        let b = Vector.dot(d, e_c)
        let delta = b * b - Vector.dot(d, d)* (Vector.dot(e_c, e_c) - R*R)
        if (delta < 0) {
            return NaN;
        }
        let t1 = (-b + Math.sqrt(delta)) / Vector.dot(d, d)
        let t2 = (-b - Math.sqrt(delta)) / Vector.dot(d, d)
        if (t1 < 0 && t2 < 0) {return NaN;}
        else if (t1 > 0 && t2 > 0) {return Math.min(t1, t2);}
        else {return Math.max(t1, t2);}
    }

    getNorm(pos: Vector): Vector {
        return Vector.norm(Vector.minus(pos, this.center))
    }
}