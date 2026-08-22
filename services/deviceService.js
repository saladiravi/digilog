
// services/deviceService.js
const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');
 
async function connectDevice(ip, port = 4370) {
  const zk = new ZKLib(ip, port, 10000, 4000);
  await zk.createSocket();
  return zk;
}

async function getDeviceAttendance(ip, port) {
  const zk = await connectDevice(ip, port);
  try {
    const logs = await zk.getAttendances();
    return logs.data; // [{ userId, timestamp, ... }]
  } finally {
    await zk.disconnect();
  }
}

 

async function getDeviceUsers(ip, port) {
  const zk = await connectDevice(ip, port);
  try {
    const users = await zk.getUsers();
    return users.data; // [{ uid, userId, name, ... }]
  } finally {
    await zk.disconnect();
  }
}

async function createDeviceUser(ip, port, userSn, userId, name, password = '') {
  const zk = new ZKLib(ip, port, 10000, 4000);
  await zk.createSocket();
  try {
    const buf = Buffer.alloc(72, 0);

    buf.writeUInt16LE(userSn, 0);                                              // internal serial number
    buf.writeUInt8(0, 2);                                                      // permission: common user, enabled
    buf.write(password.padEnd(8, '\x00').slice(0, 8), 3, 'ascii');             // password (8 bytes)
    buf.write(String(name).padEnd(24, '\x00').slice(0, 24), 11, 'ascii');      // name (24 bytes)
    buf.writeUInt32LE(0, 35);                                                  // card number
    buf.writeUInt8(1, 39);                                                     // group no
    buf.writeUInt16LE(0, 40);                                                  // user tz flag
    buf.write(String(userId).padEnd(9, '\x00').slice(0, 9), 48, 'ascii');      // user id (9 bytes)

    await zk.zklibTcp.executeCmd(COMMANDS.CMD_DISABLEDEVICE, '');
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_USER_WRQ, buf);
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_ENABLEDEVICE, '');

    return { status: 'user_created' };
  } finally {
    await zk.disconnect();
  }
}

// async function getDeviceAttendance(ip, port) {
//   const zk = await connectDevice(ip, port);
//   try {
//     const logs = await zk.getAttendances();
//     return logs.data; // [{ userId, timestamp, ... }]
//   } finally {
//     await zk.disconnect();
//   }
// }



async function startRemoteEnroll(ip, port, userId, fingerIndex = 0) {
  const zk = new ZKLib(ip, port, 10000, 4000);
  await zk.createSocket();

  try {
    // build the 26-byte CMD_STARTENROLL payload
    const buf = Buffer.alloc(26, 0);
    buf.write(String(userId), 0, 'ascii');   // user id string, left-padded with zeros
    buf.writeUInt8(fingerIndex, 24);         // finger slot 0–9
    buf.writeUInt8(1, 25);                   // flag = 1 (valid fingerprint)

    await zk.zklibTcp.executeCmd(COMMANDS.CMD_CANCELCAPTURE, '');
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, buf);
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTVERIFY, '');

    // device now shows "place finger" on its screen — ask 3x for a valid enroll
    return { status: 'enroll_mode_started' };
  } finally {
    await zk.disconnect();
  }
}


async function checkFingerprintExists(ip, port, userSn, fingerIndex = 0) {
  const zk = new ZKLib(ip, port, 10000, 4000);
  await zk.createSocket();
  try {
    const buf = Buffer.alloc(3, 0);
    buf.writeUInt16LE(userSn, 0);
    buf.writeUInt8(fingerIndex, 2);

    const reply = await zk.zklibTcp.executeCmd(COMMANDS.CMD_USERTEMP_RRQ, buf);
    const replyCode = reply.readUInt16LE(0);

    return { exists: replyCode === COMMANDS.CMD_ACK_OK || replyCode === COMMANDS.CMD_ACK_DATA };
  } finally {
    await zk.disconnect();
  }
}
 
async function deleteDeviceUser(ip, port, userSn) {
  const zk = new ZKLib(ip, port, 10000, 4000);
  await zk.createSocket();
  try {
    const buf = Buffer.alloc(2, 0);
    buf.writeUInt16LE(userSn, 0);

    await zk.zklibTcp.executeCmd(COMMANDS.CMD_DELETE_USER, buf);
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
    return { status: 'user_deleted' };
  } finally {
    await zk.disconnect();
  }
}
module.exports = { startRemoteEnroll,connectDevice, getDeviceUsers, createDeviceUser, getDeviceAttendance,checkFingerprintExists ,deleteDeviceUser};