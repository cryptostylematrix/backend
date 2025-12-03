import {
  beginCell,
  Builder,
  Cell,
  Dictionary,
  Slice,
} from '@ton/core';

const OFF_CHAIN_CONTENT_PREFIX = 0x01;


export function flattenSnakeCell(cell: Cell): Buffer {
  let c: Cell | null = cell;
  const buffers: Buffer[] = [];


  while (c) {
    const slice = c.beginParse();

    // Read current chunk of data
    const bits = slice.remainingBits;
    if (bits > 0) {
      const bytesToRead = Math.floor(bits / 8);
      if (bytesToRead > 0) {
        const chunk = slice.loadBuffer(bytesToRead);
        buffers.push(chunk);
      }
    }

    // Move to next referenced cell, if any
    if (slice.remainingRefs > 0) {
      c = slice.loadRef();
    } else {
      c = null;
    }
  }

  return Buffer.concat(buffers);
}

function bufferToChunks(buff: Buffer, chunkSize: number) {
  const chunks: Buffer[] = [];
  while (buff.byteLength > 0) {
    chunks.push(buff.slice(0, chunkSize));
    // eslint-disable-next-line no-param-reassign
    buff = buff.slice(chunkSize);
  }
  return chunks;
}

export function makeSnakeCell(data: Buffer): Cell {
  const chunks = bufferToChunks(data, 127);

  if (chunks.length === 0) {
    return beginCell().endCell();
  }

  if (chunks.length === 1) {
    return beginCell().storeBuffer(chunks[0]).endCell();
  }

  let curCell = beginCell();

  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];

    curCell.storeBuffer(chunk);

    if (i - 1 >= 0) {
      const nextCell = beginCell();
      nextCell.storeRef(curCell);
      curCell = nextCell;
    }
  }

  return curCell.endCell();
}

export function encodeOffChainContent(content: string) {
  let data = Buffer.from(content);
  const offChainPrefix = Buffer.from([OFF_CHAIN_CONTENT_PREFIX]);
  data = Buffer.concat([offChainPrefix, data]);
  return makeSnakeCell(data);
}

interface ChunkDictValue {
  content: Buffer;
}
export const ChunkDictValueSerializer = {
  serialize(src: ChunkDictValue, builder: Builder) {

  },
  parse(src: Slice): ChunkDictValue {
    const snake = flattenSnakeCell(src.loadRef());
    return { content: snake };
  },
};

export function ParseChunkDict(cell: Slice): Buffer {
  const dict = cell.loadDict(
    Dictionary.Keys.Uint(32),
    ChunkDictValueSerializer
  );

  let buf = Buffer.alloc(0);
  for (const [_, v] of dict) {
    buf = Buffer.concat([buf, v.content]);
  }
  return buf;
}
