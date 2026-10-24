//! Exact f64 implementation of LADIR's existing value noise.
//! A worker owns one instance. No allocator, raw-pointer ownership, or memory.grow.

const CAPACITY: usize = 8192;
#[derive(Clone, Copy)]
#[repr(C)]
struct Entry { x: f64, y: f64, z: f64, frequency: f64, value: f64, seed: u32, octaves: u32, valid: u32 }
const EMPTY: Entry = Entry { x: 0.0, y: 0.0, z: 0.0, frequency: 0.0, value: 0.0, seed: 0, octaves: 0, valid: 0 };
static mut CACHE: [Entry; CAPACITY] = [EMPTY; CAPACITY];
static mut HITS: u32 = 0;
static mut MISSES: u32 = 0;
static mut USED: u32 = 0;

#[inline(always)]
fn mix(a: f64, b: f64, t: f64) -> f64 { a + (b - a) * t }
#[inline(always)]
fn fade(t: f64) -> f64 { t*t*t*(t*(t*6.0-15.0)+10.0) }
#[inline(always)]
fn lattice(x: u32, y: u32, z: u32, seed: u32) -> f64 {
    let h = x.wrapping_mul(374761393) ^ y.wrapping_mul(668265263) ^ z.wrapping_mul(2147483647) ^ seed;
    let h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    (h ^ (h >> 16)) as f64 / 2147483647.5 - 1.0
}
// Rust casts saturate, JS bitwise operations wrap. The supported planet domain
// is far inside i64; wrapping here also covers negative/high lattice coordinates.
#[inline(always)]
fn floor(x: f64) -> f64 { x.floor() }
#[inline(always)]
fn uint(x: f64) -> u32 {
    // Avoid floating-point remainder in every lattice lookup. The i64 cast
    // followed by u32 truncation is exact throughout the terrain domain.
    if x >= -9223372036854775808.0 && x < 9223372036854775808.0 { x as i64 as u32 }
    else { (x % 4294967296.0) as i64 as u32 }
}
#[no_mangle]
pub extern "C" fn noise3(x: f64, y: f64, z: f64, seed: u32) -> f64 {
    let ix = floor(x); let iy = floor(y); let iz = floor(z);
    let u = fade(x-ix); let v = fade(y-iy); let w = fade(z-iz);
    let a=uint(ix); let b=uint(iy); let c=uint(iz);
    let aa=a.wrapping_add(1); let bb=b.wrapping_add(1); let cc=c.wrapping_add(1);
    mix(mix(mix(lattice(a,b,c,seed),lattice(aa,b,c,seed),u),mix(lattice(a,bb,c,seed),lattice(aa,bb,c,seed),u),v),
        mix(mix(lattice(a,b,cc,seed),lattice(aa,b,cc,seed),u),mix(lattice(a,bb,cc,seed),lattice(aa,bb,cc,seed),u),v),w)
}
#[no_mangle]
pub extern "C" fn fbm_uncached(x: f64, y: f64, z: f64, mut frequency: f64, seed: u32, octaves: u32) -> f64 {
    let mut sum=0.0; let mut amp=0.5;
    for i in 0..octaves.min(32) { sum += amp*noise3(x*frequency,y*frequency,z*frequency,seed.wrapping_add(i*1013)); frequency*=2.03; amp*=0.49; }
    sum
}
#[inline(always)]
fn hash_f64(x: f64) -> u32 { let b=x.to_bits(); (b as u32) ^ ((b >> 32) as u32) }
#[no_mangle]
pub extern "C" fn fbm(x: f64, y: f64, z: f64, frequency: f64, seed: u32, octaves: u32) -> f64 {
    let mut h=hash_f64(x).wrapping_mul(73856093) ^ hash_f64(y).wrapping_mul(19349663) ^ hash_f64(z).wrapping_mul(83492791) ^ hash_f64(frequency) ^ seed ^ octaves.wrapping_mul(1013);
    h ^= h >> 16; h = h.wrapping_mul(0x7feb352d); h ^= h >> 15;
    // Exact input comparison: hash collisions can only evict, never alter height.
    unsafe {
        let e = core::ptr::addr_of_mut!(CACHE).cast::<Entry>().add(h as usize & (CAPACITY-1));
        if (*e).valid!=0 && (*e).x==x && (*e).y==y && (*e).z==z && (*e).frequency==frequency && (*e).seed==seed && (*e).octaves==octaves {
            HITS=HITS.wrapping_add(1); return (*e).value;
        }
        MISSES=MISSES.wrapping_add(1);
        let value=fbm_uncached(x,y,z,frequency,seed,octaves);
        if (*e).valid==0 { USED+=1; }
        *e=Entry {x,y,z,frequency,value,seed,octaves,valid:1}; value
    }
}
#[no_mangle]
pub extern "C" fn reset_cache() {
    unsafe { core::ptr::write_bytes(core::ptr::addr_of_mut!(CACHE).cast::<Entry>(),0,CAPACITY); HITS=0; MISSES=0; USED=0; }
}
#[no_mangle]
pub extern "C" fn cache_hits() -> u32 { unsafe { HITS } }
#[no_mangle]
pub extern "C" fn cache_misses() -> u32 { unsafe { MISSES } }
#[no_mangle]
pub extern "C" fn cache_used() -> u32 { unsafe { USED } }
#[no_mangle]
pub extern "C" fn cache_capacity() -> u32 { CAPACITY as u32 }
#[no_mangle]
pub extern "C" fn cache_bytes() -> u32 { core::mem::size_of::<[Entry; CAPACITY]>() as u32 }
#[no_mangle]
pub extern "C" fn kernel_version() -> u32 { 1 }
