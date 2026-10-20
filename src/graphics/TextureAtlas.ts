import * as PIXI from 'pixi.js';
import { resolveAssetUrl } from '@utils/assetUrl';

export class TextureAtlas {
  readonly frames: PIXI.Texture[] = [];

  constructor(
    readonly texture: PIXI.Texture,
    readonly columns: number,
    readonly rows: number,
    readonly frameWidth: number,
    readonly frameHeight: number
  ) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        this.frames.push(
          new PIXI.Texture({
            source: texture.source,
            frame: new PIXI.Rectangle(
              column * frameWidth,
              row * frameHeight,
              frameWidth,
              frameHeight
            ),
          })
        );
      }
    }
  }

  frameAt(column: number, row: number): PIXI.Texture | null {
    if (column < 0 || column >= this.columns || row < 0 || row >= this.rows) return null;
    return this.frames[row * this.columns + column] ?? null;
  }
}

export async function loadTextureAtlas(
  path: string,
  columns: number,
  rows: number,
  frameWidth: number,
  frameHeight: number
): Promise<TextureAtlas> {
  const texture = await PIXI.Assets.load<PIXI.Texture>(resolveAssetUrl(path));
  return new TextureAtlas(texture, columns, rows, frameWidth, frameHeight);
}
