import os from 'os';
import si from 'systeminformation';

export async function getInfo(){
    try{
        const cpuLoad = await si.currentLoad();
    const cpuUsage = cpuLoad.currentLoad.toFixed(2); // Percentage

    // Memory Usage
    const totalMem = os.totalmem(); // Total memory in bytes
    const freeMem = os.freemem(); // Free memory in bytes
    const usedMem = totalMem - freeMem;
    const memoryUsage = ((usedMem / totalMem) * 100).toFixed(2); // Percentage

    // Battery Info
    const battery = await si.battery();
    const batteryPercentage = battery.hasBattery ? battery.percent : "No Battery";
    const Info = {
        cpuUsage,
        memoryUsage,
        batteryPercentage
    }
    return Info;
    }catch(error){
       return error;
    }
}