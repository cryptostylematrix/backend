import { beginCell, Dictionary, type DictionaryValue, type Builder, type Slice } from "@ton/core";
import { sha256_sync } from "@ton/crypto";
export type NftContentOffchain = {
    type: 'offchain',
    uri: string
}
export type OnChainContentData = 'uri' | 'name' | 'description' | 'image' | 'image_data' | 'symbol' | 'decimals' | 'amount_style' | 'render_type' | 'currency' | 'game' | 'content_type' | 'content_url' | 'lottie' | 'attributes';

export type NftContentOnchain = {
    type: 'onchain',
    data: Partial<Record<OnChainContentData, string>>
}

export type NftContent = NftContentOnchain | NftContentOffchain;

export function OnChainString(): DictionaryValue<string> {
    return {
        serialize(src: string, builder: Builder) {
            builder.storeRef(beginCell().storeUint(0, 8).storeStringTail(src));
        },
        parse(src: Slice) {
           
            const sc  = src.loadRef().beginParse();
            const tag = sc.loadUint(8);
            
            if(tag == 1) {
                return sc.loadStringTail();
            } else if(tag == 0) {

                // Not really tested, but feels like it should work
                const chunkDict = Dictionary.loadDirect(Dictionary.Keys.Uint(32), Dictionary.Values.Cell(), sc);
                return chunkDict.values().map(x => x.beginParse().loadStringTail()).join('');

            } else {
                throw Error(`Prefix ${tag} is not supported yet!`);
            }
        }
    }
}

export function nftContentToCell(content: NftContent) {

    
    if(content.type == 'offchain') {
        return beginCell()
            .storeUint(1, 8)
            .storeStringRefTail(content.uri) //Snake logic under the hood
            .endCell();
    }
    let keySet = new Set(['uri' , 'name' , 'description' , 'image' , 'image_data' , 'symbol' , 'decimals' , 'amount_style' , 'render_type' , 'currency' , 'game', 'content_type', 'content_url', 'lottie', 'attributes']);
    let contentDict = Dictionary.empty(Dictionary.Keys.Buffer(32), OnChainString());

    for (let contentKey in content.data) {

        if(keySet.has(contentKey)) {
            contentDict.set(
                sha256_sync(contentKey),
                content.data[contentKey as OnChainContentData]!
            );
        }
    }

    let result = beginCell().storeUint(0, 8).storeDict(contentDict).endCell();
    return result;
}
