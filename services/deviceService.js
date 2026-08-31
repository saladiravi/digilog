
// services/deviceService.js
const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');
const { createTCPHeader, decodeTCPHeader } = require('node-zklib/utils');

// existing function you already have — trigger the device into enroll/scan mode
async function startRemoteEnroll(ip, port, userId, fingerIndex = 0) {
  const zk = new ZKLib(ip, port, 10000, 4000);
  await zk.createSocket();

  try {
    const buf = Buffer.alloc(26, 0);
    buf.write(String(userId), 0, 'ascii');
    buf.writeUInt8(fingerIndex, 24);
    buf.writeUInt8(1, 25);

    await zk.zklibTcp.executeCmd(COMMANDS.CMD_CANCELCAPTURE, '');
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, buf);
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTVERIFY, '');

    return { status: 'enroll_mode_started' };
  } finally {
    await zk.disconnect();
  }
}

// new function — listens for finger-placed / enroll-progress events live
async function listenForEnrollEvents(ip, port, onEvent) {
  const zk = new ZKLib(ip, port, 10000, 4000);
  await zk.createSocket();

  const socket = zk.zklibTcp.socket;
  const sessionId = zk.zklibTcp.sessionId;
  const replyId = ++zk.zklibTcp.replyId;

  const eventMask =
    COMMANDS.EF_ATTLOG |
    COMMANDS.EF_FINGER |
    COMMANDS.EF_ENROLLFINGER |
    COMMANDS.EF_ENROLLUSER |
    COMMANDS.EF_VERIFY;

  const maskBuf = Buffer.alloc(4);
  maskBuf.writeUInt32LE(eventMask, 0);

  const regBuf = createTCPHeader(COMMANDS.CMD_REG_EVENT, sessionId, replyId, maskBuf);
  socket.write(regBuf);

  socket.on('data', (data) => {
    try {
      decodeTCPHeader(data); // validates it's a real TCP-framed packet
      const payload = data.subarray(8);
      const eventCode = payload.readUIntLE(4, 2);

      let label = 'unknown';
      if (eventCode === COMMANDS.EF_FINGER) label = 'finger_placed';
      else if (eventCode === COMMANDS.EF_ENROLLFINGER) label = 'enroll_finger_result';
      else if (eventCode === COMMANDS.EF_ENROLLUSER) label = 'enroll_user_event';
      else if (eventCode === COMMANDS.EF_ATTLOG) label = 'attendance_log';
      else if (eventCode === COMMANDS.EF_VERIFY) label = 'verify_event';

      console.log(`📡 raw event: code=${eventCode} label=${label} hex=${payload.toString('hex')}`);
      onEvent({ eventCode, label, raw: payload });
    } catch (err) {
      console.error('event decode error:', err.message);
    }
  });

  return zk; // keep this reference alive — don't disconnect while listening
}

 


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

    // template exists → device starts a data-transfer sequence, beginning with CMD_PREPARE_DATA
    if (replyCode === COMMANDS.CMD_PREPARE_DATA) {
      return { exists: true };
    }

    // template doesn't exist → device replies immediately with CMD_ACK_ERROR
    if (replyCode === COMMANDS.CMD_ACK_ERROR) {
      return { exists: false };
    }

    // anything else is unexpected — log it so we can see what the device actually sent
    console.log('Unexpected checkFingerprint reply code:', replyCode);
    return { exists: false, note: 'unexpected reply code, treat as unknown' };

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
module.exports = {  startRemoteEnroll,listenForEnrollEvents, startRemoteEnroll,connectDevice, getDeviceUsers, createDeviceUser, getDeviceAttendance,checkFingerprintExists ,deleteDeviceUser};