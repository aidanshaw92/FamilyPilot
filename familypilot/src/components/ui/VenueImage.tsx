import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius } from '@/src/design-system/tokens';
import { Skeleton } from './Skeleton';
import { Text } from './Text';

interface VenueImageProps { uri?: string; category?: string; alt: string; style?: ViewStyle; borderRadius?: number }
/** Only show the venue's actual photo. Stock photography must not impersonate a place. */
export function VenueImage({uri,alt,style,borderRadius=radius.md}:VenueImageProps){
 const [loading,setLoading]=useState(Boolean(uri));const [failed,setFailed]=useState(false);
 useEffect(()=>{setLoading(Boolean(uri));setFailed(false);},[uri]);
 const credit=uri?.includes('/api/places/photo?') ? new URLSearchParams(uri.split('?')[1]).get('credit') : null;
 return <View style={[styles.wrap,{borderRadius},style]}>
  {!uri||failed?<View style={styles.empty}><Text variant="bodySmall" color={colors.text.secondary}>Photo unavailable</Text></View>:<>
   {loading?<Skeleton height={120} borderRadius={borderRadius} style={StyleSheet.absoluteFill}/>:null}
   <Image source={{uri}} style={styles.image} contentFit="cover" transition={200} accessibilityLabel={alt} onLoad={()=>setLoading(false)} onError={()=>{setFailed(true);setLoading(false);}}/>
  </>}
  {credit ? <View style={{position:'absolute',bottom:0,left:0,right:0,backgroundColor:'rgba(0,0,0,0.55)',padding:3}}><Text variant="caption" color="#FFFFFF" numberOfLines={1}>{credit} · Google</Text></View> : null}
 </View>;
}
const styles=StyleSheet.create({wrap:{overflow:'hidden',backgroundColor:colors.borderLight},image:{width:'100%',height:'100%'},empty:{flex:1,alignItems:'center',justifyContent:'center',minHeight:100}});
