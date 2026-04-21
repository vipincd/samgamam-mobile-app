// mobile-app/src/app/(tabs)/index.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { apiClient } from '../../api/client';

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Moments We Share.</Text>
      <Text style={styles.subtitle}>Discover events near you.</Text>
      
      {/* Search Bar / List placeholder */}
      <View style={styles.placeholderCard}>
        <Text style={styles.cardTitle}>Upcoming Event</Text>
        <Text>Backend API integration pending...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF3366',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
    marginBottom: 20,
  },
  placeholderCard: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    marginTop: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  }
});
