import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius } from '@/src/design-system/tokens';
import { photoCredit } from '@/src/services/places/place-photo-url';
import { Skeleton } from './Skeleton';
import { Text } from './Text';

// style is composed into an array below, so callers may pass an array or a conditional style the
// same way they can with any View. Declaring it as a bare ViewStyle was narrower than the
// implementation and rejected valid call sites.
interface VenueImageProps {
  uri?: string;
  category?: string;
  alt: string;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  /**
   * Google requires the photographer to be named wherever their photo is shown. This draws that
   * line across the foot of the image, which is right for a plain thumbnail but wrong where the
   * caller stacks its own content over the photo — there the caller places the credit itself.
   */
  showCredit?: boolean;
  /**
   * Pass 'none' where the photo is decoration inside something interactive. On web an <img> is
   * natively draggable, and that drag captures the pointer — which silently killed the Home
   * deck's swipe as soon as real photographs started loading in place of the gradient fallback.
   */
  pointerEvents?: 'auto' | 'none';
  /**
   * Every photograph a parent sees costs real money. A proxy request that misses the CDN buys a
   * Place Details call AND a Place Photos call from Google, so one off-screen thumbnail is two
   * billable requests for an image nobody looked at.
   *
   * Measured on 2026-10-01 at an iPhone viewport (390x844) against the local fixture: Explore
   * mounted 15 photo elements and fired 12 proxy requests, while only FOUR were on screen. Eleven
   * rows sat between 891px and 2511px down the page, below the fold, each one bought on open.
   *
   * `loading` is expo-image's own pass-through to the HTML attribute, so the browser decides what
   * "near the viewport" means and nothing about the layout changes. The default is 'lazy' because
   * an image that IS in the viewport still loads immediately under that attribute -- Home's deck
   * measured 3 photographs all fully visible at 86-100% opacity, and all three still load. Pass
   * 'eager' only where a photograph must be fetched before it can possibly be scrolled into view.
   */
  loading?: 'lazy' | 'eager';
}

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

const FALLBACK_GRADIENT: readonly [string, string] = [colors.midnight.start, colors.midnight.end];

function categoryGradient(category?: string): readonly [string, string] {
  if (category && category in colors.categoryGradients) {
    return colors.categoryGradients[category as keyof typeof colors.categoryGradients];
  }
  return FALLBACK_GRADIENT;
}

/** Only show the venue's actual photo. Stock photography must not impersonate a place. Without
 * one, a category-owned gradient + icon reads as a designed placeholder rather than a broken
 * image — and upgrades to a real photo the moment one exists, with no layout change. */
export function VenueImage({uri,category,alt,style,borderRadius=radius.md,showCredit=true,pointerEvents='auto',loading='lazy'}:VenueImageProps){
 const [pending,setPending]=useState(Boolean(uri));const [failed,setFailed]=useState(false);
 useEffect(()=>{setPending(Boolean(uri));setFailed(false);},[uri]);
 const credit=showCredit&&!failed?photoCredit(uri):null;
 const icon = category ? CATEGORY_ICONS[category] : undefined;
 const [gradientStart, gradientEnd] = categoryGradient(category);
 return <View pointerEvents={pointerEvents} style={[styles.wrap,{borderRadius},style]}>
  {!uri||failed?
   <LinearGradient
     colors={[gradientStart, gradientEnd]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.empty}
     accessible accessibilityRole="image" accessibilityLabel={`${alt}, photo not available`}
   >
    <Ionicons name={icon ?? 'image-outline'} size={30} color="rgba(255,255,255,0.92)" importantForAccessibility="no" />
   </LinearGradient>
  :<>
   {pending?<Skeleton height={120} borderRadius={borderRadius} style={StyleSheet.absoluteFill}/>:null}
   <Image source={{uri}} style={styles.image} contentFit="cover" transition={200} loading={loading} accessibilityLabel={alt} onLoad={()=>setPending(false)} onError={()=>{setFailed(true);setPending(false);}}/>
  </>}
  {credit ? <View style={styles.credit} pointerEvents="none"><Text variant="caption" color="#FFFFFF" numberOfLines={3} style={styles.creditText}>Photo: {credit}</Text></View> : null}
 </View>;
}
const styles=StyleSheet.create({
  wrap:{overflow:'hidden',backgroundColor:colors.borderLight},
  // The photographer Google requires us to name, set as a small chip inset from the corner rather than
  // a full-width strip. The provider's own mark is shown once under the list (PlaceCredits), so the
  // chip carries only what belongs to the photograph.
  credit:{position:'absolute',left:6,bottom:6,maxWidth:'88%',paddingHorizontal:7,paddingVertical:2,borderRadius:11,backgroundColor:'rgba(13,23,51,0.58)'},
  // Up to three lines, so a long two-part name ("Photo:" / "Christopher" / "Montgomery") is shown whole at the
  // narrowest thumbnail rather than cut. A single word wider than the chip would still be ellipsised; the venue
  // screen names the photographer in full, which is where the provider's terms are met.
  creditText:{fontSize:10,lineHeight:13,fontFamily:'Inter_500Medium'},
  image:{width:'100%',height:'100%'},
  empty:{flex:1,alignItems:'center',justifyContent:'center',minHeight:100},
});
