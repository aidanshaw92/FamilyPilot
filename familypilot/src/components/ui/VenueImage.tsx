import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius } from '@/src/design-system/tokens';
import { Skeleton } from './Skeleton';
import { Text } from './Text';

interface VenueImageProps { uri?: string; category?: string; alt: string; style?: ViewStyle; borderRadius?: number }

// A quiet category glyph reads far lighter than a block of "Photo unavailable" text filling the
// same space a real photo would — it's still obviously a placeholder, just not a wall of grey.
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  park: 'leaf-outline',
  farm: 'flower-outline',
  museum: 'library-outline',
  zoo: 'paw-outline',
  attraction: 'sparkles-outline',
  activity: 'bicycle-outline',
  soft_play: 'happy-outline',
  cafe: 'cafe-outline',
  restaurant: 'restaurant-outline',
  hotel: 'bed-outline',
  shop: 'bag-outline',
  beach: 'sunny-outline',
};

/** Only show the venue's actual photo. Stock photography must not impersonate a place. */
export function VenueImage({uri,category,alt,style,borderRadius=radius.md}:VenueImageProps){
 const [loading,setLoading]=useState(Boolean(uri));const [failed,setFailed]=useState(false);
 useEffect(()=>{setLoading(Boolean(uri));setFailed(false);},[uri]);
 const credit=uri?.includes('/api/places/photo?') ? new URLSearchParams(uri.split('?')[1]).get('credit') : null;
 const icon = category ? CATEGORY_ICONS[category] : undefined;
 return <View style={[styles.wrap,{borderRadius},style]}>
  {!uri||failed?<View style={styles.empty}>
    <View style={styles.emptyIconWrap}>
      <Ionicons name={icon ?? 'image-outline'} size={22} color={colors.text.tertiary} />
    </View>
    <Text variant="caption" color={colors.text.tertiary}>Photo unavailable</Text>
   </View>:<>
   {loading?<Skeleton height={120} borderRadius={borderRadius} style={StyleSheet.absoluteFill}/>:null}
   <Image source={{uri}} style={styles.image} contentFit="cover" transition={200} accessibilityLabel={alt} onLoad={()=>setLoading(false)} onError={()=>{setFailed(true);setLoading(false);}}/>
  </>}
  {credit ? <View style={{position:'absolute',bottom:0,left:0,right:0,backgroundColor:'rgba(0,0,0,0.55)',padding:3}}><Text variant="caption" color="#FFFFFF" numberOfLines={1}>{credit} · Google</Text></View> : null}
 </View>;
}
const styles=StyleSheet.create({
  wrap:{overflow:'hidden',backgroundColor:colors.borderLight},
  image:{width:'100%',height:'100%'},
  empty:{flex:1,alignItems:'center',justifyContent:'center',gap:6,minHeight:100},
  emptyIconWrap:{width:40,height:40,borderRadius:20,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},
});
