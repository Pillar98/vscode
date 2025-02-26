"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const path = __importStar(require("path"));
const promises_1 = require("fs/promises");
const cross_spawn_promise_1 = require("@malept/cross-spawn-promise");
const MACHO_PREFIX = 'Mach-O ';
const MACHO_64_MAGIC_LE = 0xfeedfacf;
const MACHO_UNIVERSAL_MAGIC_LE = 0xbebafeca;
const MACHO_ARM64_CPU_TYPE = new Set([
    0x0c000001,
    0x0100000c,
]);
const MACHO_X86_64_CPU_TYPE = new Set([
    0x07000001,
    0x01000007,
]);
async function read(file, buf, offset, length, position) {
    let filehandle;
    try {
        filehandle = await (0, promises_1.open)(file);
        await filehandle.read(buf, offset, length, position);
    }
    finally {
        await filehandle?.close();
    }
}
async function checkMachOFiles(appPath, arch) {
    const visited = new Set();
    const invalidFiles = [];
    const header = Buffer.alloc(8);
    const file_header_entry_size = 20;
    const checkx86_64Arch = (arch === 'x64');
    const checkArm64Arch = (arch === 'arm64');
    const checkUniversalArch = (arch === 'universal');
    const traverse = async (p) => {
        p = await (0, promises_1.realpath)(p);
        if (visited.has(p)) {
            return;
        }
        visited.add(p);
        const info = await (0, promises_1.stat)(p);
        if (info.isSymbolicLink()) {
            return;
        }
        if (info.isFile()) {
            let fileOutput = '';
            try {
                fileOutput = await (0, cross_spawn_promise_1.spawn)('file', ['--brief', '--no-pad', p]);
            }
            catch (e) {
                if (e instanceof cross_spawn_promise_1.ExitCodeError) {
                    /* silently accept error codes from "file" */
                }
                else {
                    throw e;
                }
            }
            if (fileOutput.startsWith(MACHO_PREFIX)) {
                console.log(`Verifying architecture of ${p}`);
                read(p, header, 0, 8, 0).then(_ => {
                    const header_magic = header.readUInt32LE();
                    if (header_magic === MACHO_64_MAGIC_LE) {
                        const cpu_type = header.readUInt32LE(4);
                        if (checkUniversalArch) {
                            invalidFiles.push(p);
                        }
                        else if (checkArm64Arch && !MACHO_ARM64_CPU_TYPE.has(cpu_type)) {
                            invalidFiles.push(p);
                        }
                        else if (checkx86_64Arch && !MACHO_X86_64_CPU_TYPE.has(cpu_type)) {
                            invalidFiles.push(p);
                        }
                    }
                    else if (header_magic === MACHO_UNIVERSAL_MAGIC_LE) {
                        const num_binaries = header.readUInt32BE(4);
                        assert_1.default.equal(num_binaries, 2);
                        const file_entries_size = file_header_entry_size * num_binaries;
                        const file_entries = Buffer.alloc(file_entries_size);
                        read(p, file_entries, 0, file_entries_size, 8).then(_ => {
                            for (let i = 0; i < num_binaries; i++) {
                                const cpu_type = file_entries.readUInt32LE(file_header_entry_size * i);
                                if (!MACHO_ARM64_CPU_TYPE.has(cpu_type) && !MACHO_X86_64_CPU_TYPE.has(cpu_type)) {
                                    invalidFiles.push(p);
                                }
                            }
                        });
                    }
                });
            }
        }
        if (info.isDirectory()) {
            for (const child of await (0, promises_1.readdir)(p)) {
                await traverse(path.resolve(p, child));
            }
        }
    };
    await traverse(appPath);
    return invalidFiles;
}
const archToCheck = process.argv[2];
(0, assert_1.default)(process.env['APP_PATH'], 'APP_PATH not set');
(0, assert_1.default)(archToCheck === 'x64' || archToCheck === 'arm64' || archToCheck === 'universal', `Invalid architecture ${archToCheck} to check`);
checkMachOFiles(process.env['APP_PATH'], archToCheck).then(invalidFiles => {
    if (invalidFiles.length > 0) {
        console.error('\x1b[31mThe following files are built for the wrong architecture:\x1b[0m');
        for (const file of invalidFiles) {
            console.error(`\x1b[31m${file}\x1b[0m`);
        }
        process.exit(1);
    }
    else {
        console.log('\x1b[32mAll files are valid\x1b[0m');
    }
}).catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=verify-macho.js.map