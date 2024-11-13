import { b as buffer } from './lazy-chunk-index.es.js';
import { b as TransportError } from './lazy-chunk-Transport.es.js';

const Tag = 0x05;
function asUInt16BE(value) {
    const b = buffer.Buffer.alloc(2);
    b.writeUInt16BE(value, 0);
    return b;
}
const initialAcc = {
    data: buffer.Buffer.alloc(0),
    dataLength: 0,
    sequence: 0,
};
/**
 *
 */
const createHIDframing = (channel, packetSize) => {
    return {
        makeBlocks(apdu) {
            let data = buffer.Buffer.concat([asUInt16BE(apdu.length), apdu]);
            const blockSize = packetSize - 5;
            const nbBlocks = Math.ceil(data.length / blockSize);
            data = buffer.Buffer.concat([
                data,
                buffer.Buffer.alloc(nbBlocks * blockSize - data.length + 1).fill(0),
            ]);
            const blocks = [];
            for (let i = 0; i < nbBlocks; i++) {
                const head = buffer.Buffer.alloc(5);
                head.writeUInt16BE(channel, 0);
                head.writeUInt8(Tag, 2);
                head.writeUInt16BE(i, 3);
                const chunk = data.slice(i * blockSize, (i + 1) * blockSize);
                blocks.push(buffer.Buffer.concat([head, chunk]));
            }
            return blocks;
        },
        reduceResponse(acc, chunk) {
            let { data, dataLength, sequence } = acc || initialAcc;
            if (chunk.readUInt16BE(0) !== channel) {
                throw new TransportError("Invalid channel", "InvalidChannel");
            }
            if (chunk.readUInt8(2) !== Tag) {
                throw new TransportError("Invalid tag", "InvalidTag");
            }
            if (chunk.readUInt16BE(3) !== sequence) {
                throw new TransportError("Invalid sequence", "InvalidSequence");
            }
            if (!acc) {
                dataLength = chunk.readUInt16BE(5);
            }
            sequence++;
            const chunkData = chunk.slice(acc ? 5 : 7);
            data = buffer.Buffer.concat([data, chunkData]);
            if (data.length > dataLength) {
                data = data.slice(0, dataLength);
            }
            return {
                data,
                dataLength,
                sequence,
            };
        },
        getReducedResult(acc) {
            if (acc && acc.dataLength === acc.data.length) {
                return acc.data;
            }
        },
    };
};

export { createHIDframing as c };
//# sourceMappingURL=lazy-chunk-hid-framing.es.js.map
