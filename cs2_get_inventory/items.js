const fs = require('fs');
const VDF = require('@node-steam/vdf');
function parse_data(path) {
    try {
        const data = fs.readFileSync(path, 'utf8');
        const parsedData = VDF.parse(data); 
        return parsedData        
    } catch (err) {
        console.error(err);                          
    }
}

const items = parse_data('./items_game.txt');
const translation = parse_data('./csgo_english.txt');


const convertKeysToLowerCaseDeep = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj; 
    
    return Object.keys(obj).reduce((acc, key) => {
      const lowerCaseKey = key.toLowerCase();
      
      acc[lowerCaseKey] = convertKeysToLowerCaseDeep(obj[key]);
      
      return acc;
    }, {});
  };

  function main(csgo, item) {
    return new Promise((resolve, reject) => {
        if (item.casket_contained_item_count == 0) {
            resolve([])
        }
        csgo.getCasketContents(item.id, (err, items) => {
            if (err) {
                return reject(err);
            }
            return resolve(Process_Items(items, csgo))
        });
    })
}
async function Process_Items(items, csgo){
    const res = []
    for(const item of items){
        const item_res = {}
        item_type = analayze_type_of_skin(item)
        if (item_type == "casket"){
            item_res['id'] = item.id
            item_res['custon_name'] = item.custom_name
            item_res['items'] = await main(csgo, item)
        }   
        else if (item_type != "unknown"){
            item_res['id'] = item.id
            item_res['def_index'] = item.def_index
            item_res['rarity'] = item.rarity
            item_res['name'] = get_name(item , item_type)
            if (item_type == "coin" || item_res['name'] == "Music KIT | Valve"){
                item_res['tradeable'] = false
            }
            else if (item_type == "spraypaint" || item_type == "spray"){
                if (item.tradable_after){
                    item_res['tradeable'] = true
                }
                else item_res['tradeable'] = false
            }
            else item_res['tradeable'] = true

            if (item_res['tradeable'] == true){
                if (item.tradable_after){
                    const date = Date.now()
                    if (item.tradable_after > date){
                        item_res['marketable'] = false
                    }
                    else item_res['marketable'] = true
                }
                else item_res['marketable'] = true
            }
            if (item.paint_wear){
                item_res['paint_wear'] = item.paint_wear
            }
            if (item.paint_seed){
                item_res['paint_seed'] = item.paint_seed
            }
            let keychain_seed = null
            item.attribute.forEach(element => {
                if (element.def_index == 306) {
                    keychain_seed = element['value_bytes']
                }
            });
            if (keychain_seed != null){
                let data = keychain_seed.readInt32LE(0);
                item_res['keychain_seed'] = data
            }
            item_res['type'] = item_type
            res.push(item_res)
        }

           
    }
    return res

}
function analayze_type_of_skin(item){
    let item_type = ""
    if (items['items_game']['items'][item.def_index].name.toLowerCase().includes('coin') || items['items_game']['items'][item.def_index].name.toLowerCase().includes('tournament_journal')){
        item_type = "coin"
    }
    else if (items['items_game']['items'][item.def_index].name.toLowerCase().includes('spraypaint')){
        item_type = "spraypaint"
    }
    else if (items['items_game']['items'][item.def_index].name.toLowerCase().includes('crate')){
        item_type = "crate"
    }
    else if (items['items_game']['items'][item.def_index].name.toLowerCase().includes('music')){
        item_type = "music"
    }
    else if (items['items_game']['items'][item.def_index].name.toLowerCase().includes('weapon')){
        item_type = "weapon_skin"
    }
    else if (items['items_game']['items'][item.def_index].name.toLowerCase().includes('casket')){
        item_type = "casket"
    }
    else if (items['items_game']['items'][item.def_index].name=="Fortius Quo Fidelius" || items['items_game']['items'][item.def_index].name=="CSGO Ten Year Anniversary Memorabilia")
        item_type = "coin"
    else if (items['items_game']['items'][item.def_index].name.includes('Pin')){
        item_type = "pin"
    }
    else if (items['items_game']['items'][item.def_index].name.includes('sticker')){
        item_type = "sticker"
    }
    else if (items['items_game']['items'][item.def_index].name.includes('patch')){
        item_type = "patch"
    }
    else if (items['items_game']['items'][item.def_index].name.includes('gloves')){
        item_type = "gloves"
    }
    else if (items['items_game']['items'][item.def_index].name.includes('customplayer')){
        item_type = "customplayer"
    }
    else if (items['items_game']['items'][item.def_index].name.includes('spray')){
        item_type = "spray"
    }
    else if (items['items_game']['items'][item.def_index].name.includes('keychain')){
        item_type = "keychain"
    }
    else{
        item_type = "unknown"
    }
    if (item.id == '17293822569102708641' || item.id == '17293822569110896676'){
        item_type = "unknown"
    }
    item_type = item?.['attribute']?.[0]?.['def_index'] === 277 ? "unknown" : item_type;
    return item_type
}
function get_name(item , item_type){
    let res = ""
    if (item_type == "weapon_skin"){
         let prefab_name = "";
         if (items?.['items_game']?.['items']?.[item.def_index]?.['item_name']) {
            prefab_name = items['items_game']['items'][item.def_index]['item_name'];
        } else {
            let prefab = items['items_game']['items'][item.def_index]['prefab'];
            prefab_name = items['items_game']['prefabs'][prefab].item_name
            
        }
         prefab_name = prefab_name.replace('#','')
         let Weapon_name = translation['lang']['Tokens'][prefab_name]

         let tag = items['items_game']['paint_kits'][item.paint_index].description_tag
         tag = tag.replace('#','')
         let Skin_name = translation['lang']['Tokens'][tag]
         let floats = ['Factory New','Minimal Wear','Field-Tested','Well-Worn','Battle-Scarred']
         let floats_val = [0.07,0.15,0.38,0.45,0.5]
         let float =  item.paint_wear
         let float_new = "Battle-Scarred"
         for (i = 0; i < floats.length; i++) {
            if (float <= floats_val[i]) {
                float_new = floats[i]
                break
            }
        }
        if (item.rarity == 6 && item.quality == 3){
            res = Weapon_name + " (★) | " + Skin_name + " (" +float_new+ ")"
            return res
        }
        else if (item.rarity == 6 && item.quality == 9){
            res = Weapon_name + " (★ StatTrak™) | " + Skin_name + " (" +float_new+ ")"
            return res
        }
        
        else {
            if (item.quality == 12){
                res = Weapon_name +" (souvenir)" + " | " + Skin_name + " (" +float_new+ ")"
                return res
            }
            else if(item.quality == 9){
                
                res = Weapon_name +" (StatTrak™) "+ " | " + Skin_name + " (" +float_new+ ")";
            
                return res
            }
            else{
                res = Weapon_name + " | " + Skin_name + " (" +float_new+ ")";
                return res
            }
            
        }
        
    }
    else if (item_type == "crate"){
        let item_name = items['items_game']['items'][item.def_index].item_name
        item_name = item_name.replace('#','')
        return translation['lang']['Tokens'][item_name]
    }
    else if (item_type == "spraypaint" || item_type == "spray"){
        let sticker_id = item.stickers[0].sticker_id
        let grafitti_name = items['items_game']['sticker_kits'][sticker_id].item_name
        grafitti_name = grafitti_name.replace('#','')
        let graffiti_first_name = translation['lang']['Tokens'][grafitti_name]
        let graffiti_tint = null
        item.attribute.forEach(element => {
            if (element.def_index == 233) {
                graffiti_tint = element['value_bytes']
            }
        });

        if (graffiti_tint == null) {
            res = "Graffiti" + " | " + graffiti_first_name;
            return res

        }
        let graffiti_tint_val = graffiti_tint.readInt32LE(0);
        let attribute_val = "Attrib_SprayTintValue_" + graffiti_tint_val
        let graffiti_second_name = translation['lang']['Tokens'][attribute_val]
        res =  "Graffiti" + " | " + graffiti_first_name + " (" + graffiti_second_name + ")"
        return res
        

    }
    else if (item_type == "sticker"){
        let sticker_id = item.stickers[0].sticker_id
        let grafitti_name = items['items_game']['sticker_kits'][sticker_id].item_name
        grafitti_name = grafitti_name.replace('#','')
        let res = translation['lang']['Tokens'][grafitti_name]
        res ="Sticker" + " | " + res
        return res
    }
    else if (item_type == "pin"){
        let item_name = items['items_game']['items'][item.def_index].item_name
        item_name = item_name.replace('#','')
        res = translation['lang']['Tokens'][item_name]
        return res
    }
    else if (item_type == "coin"){
        let data = items['items_game']['items'][item.def_index].item_name
        data = data.replace('#','')
        return translation['lang']['Tokens'][data]
    }
    else if (item_type == "customplayer"){
        let item_name = items['items_game']['items'][item.def_index].item_name
        item_name = item_name.replace('#','').toLowerCase()
        let tranlation_new = convertKeysToLowerCaseDeep(translation)
        let res = tranlation_new['lang']['tokens'][item_name]
        return res
    }
    else if (item_type == "music"){
        let data_music = 0;
        if (item.quality == 9){
            let data_music = null
            item.attribute.forEach(element => {
                if (element.def_index == 166) {
                    data_music = element['value_bytes']
                }
            });
            let data = data_music.readInt32LE(0);
            let val = items['items_game']['music_definitions'][data].name
            if (val == "valve_01"){
                return "Music KIT" + " | " + "Valve"
            }
            let val_name = "coupon_"+val;
            let res = translation['lang']['Tokens'][val_name]
            res = res.replace('|', "(StatTrak™) |")
            return res
        }
        else{
        let data_music = null
        item.attribute.forEach(element => {
                if (element.def_index == 166) {
                    data_music = element['value_bytes']
                }
            });
        let data = data_music.readInt32LE(0);
        let val = items['items_game']['music_definitions'][data].name
        if (val == "valve_01"){
            return "Music KIT" + " | " + "Valve"
        }
        let val_name = "coupon_"+val;
        let res = translation['lang']['Tokens'][val_name]
        return res
    }
        
    }
    else if (item_type == "patch"){
        let name = items['items_game']['sticker_kits'][item.stickers[0].sticker_id].item_name
        name = name.replace('#','')
        res = translation['lang']['Tokens'][name]
        res = "Patch" + " | " + res
        return res
    }
    else if (item_type == "gloves"){
        let glove_name = items['items_game']['items'][item.def_index].item_name
        glove_name = glove_name.replace('#','')
        res = translation['lang']['Tokens'][glove_name]
        let glove_index_name = items['items_game']['paint_kits'][item.paint_index].description_tag.replace('#','')
        let second_name = translation['lang']['Tokens'][glove_index_name]

        glove_index_name = glove_index_name.replace('#','')
        let floats = ['Factory New','Minimal Wear','Field-Tested','Well-Worn','Battle-Scarred'];
        let floats_val = [0.07,0.15,0.38,0.45,0.5];
        let float =  item.paint_wear;
        let float_new = "Battle-Scarred";
        for (i = 0; i < floats.length; i++) {
            if (float <= floats_val[i]) {
                float_new = floats[i]
                break
            }
        }
        res = res + "(★) | " + second_name + " (" +float_new+ ")"
        return res
    }
    else if (item_type == "keychain"){
        let keychain_data = null
            item.attribute.forEach(element => {
                if (element.def_index == 299) {
                    keychain_data = element['value_bytes']
                }
            });
        let data = keychain_data.readInt32LE(0);
        let val = items['items_game']['keychain_definitions'][data].loc_name
        val = val.replace('#','')
        let res = translation['lang']['Tokens'][val]
        res = "Keychain" + " | " + res
        return res

    }
    
}
module.exports = { Process_Items };