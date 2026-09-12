import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius } from '@/src/design-system/tokens';
import { Skeleton } from './Skeleton';
import { Text } from './Text';

interface VenueImageProps { uri?: string; category?: string; alt: string; style?: ViewStyle; borderRadius?: number }

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

const FALLBACK_GRADIENT: readonly [string, string] = [colors.primary[600], colors.primary[200]];

function categoryGradient(category?: string): readonly [string, string] {
  if (category && category in colors.categoryGradients) {
    return colors.categoryGradients[category as keyof typeof colors.categoryGradients];
  }
  return FALLBACK_GRADIENT;
}

/** Only show the venue's actual photo. Stock photography must not impersonate a place. Without
 * one, a category-owned gradient + icon reads as a designed placeholder rather than a broken
 * image — and upgrades to a real photo the moment one exists, with no layout change. */
export function VenueImage({uri,category,alt,style,borderRadius=radius.md}:VenueImageProps){
 const [loading,setLoading]=useState(Boolean(uri));const [failed,setFailed]=useState(false);
 useEffect(()=>{setLoading(Boolean(uri));setFailed(false);},[uri]);
 const credit=uri?.includes('/api/places/photo?') ? new URLSearchParams(uri.split('?')[1]).get('credit') : null;
 const icon = category ? CATEGORY_ICONS[category] : undefined;
 const [gradientStart, gradientEnd] = categoryGradient(category);
 return <View style={[styles.wrap,{borderRadius},style]}>
  {!uri||failed?
   <LinearGradient
     colors={[gradientStart, gradientEnd]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.empty}
     accessible accessibilityRole="image" accessibilityLabel={`${alt} — photo not available`}
   >
    <Ionicons name={icon ?? 'image-outline'} size={30} color="rgba(255,255,255,0.92)" importantForAccessibility="no" />
   </LinearGradient>
  :<>
   {loading?<Skeleton height={120} borderRadius={borderRadius} style={StyleSheet.absoluteFill}/>:null}
   <Image source={{uri}} style={styles.image} contentFit="cover" transition={200} accessibilityLabel={alt} onLoad={()=>setLoading(false)} onError={()=>{setFailed(true);setLoading(false);}}/>
  </>}
  {credit ? <View style={{position:'absolute',bottom:0,left:0,right:0,backgroundColor:'rgba(0,0,0,0.55)',padding:3}}><Text variant="caption" color="#FFFFFF" numberOfLines={1}>{credit} · Google</Text></View> : null}
 </View>;
}
const styles=StyleSheet.create({
  wrap:{overflow:'hidden',backgroundColor:colors.borderLight},
  image:{width:'100%',height:'100%'},
  empty:{flex:1,alignItems:'center',justifyContent:'center',minHeight:100},
});
