import 'reflect-metadata';
import 'dotenv/config';
import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq, lte } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../app.module';
import { AppConfigService } from '../config/app-config.service';
import { DATABASE, DB_BUNDLE } from './database.constants';
import type { AppDatabase, DbBundle } from './client';
import { applyMigrations } from './run-migrations';
import { admins, customers, pigmyAccounts, schemeSettings, villages } from './schema';
import { CustomersService } from '../modules/customers/customers.service';
import { PaymentsService } from '../modules/payments/payments.service';
import { addDays, DEFAULT_SCHEME } from '../modules/withdrawals/scheme.service';

const log = new Logger('Seed');

// All villages of Karnataka organized by district and taluk
const VILLAGES = [
  // ── Bangalore Urban District ──────────────────────────────────────────────
  // Bangalore North Taluk
  { name: 'Yelahanka', code: 'YLA', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Jakkur', code: 'JAK', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Kodigehalli', code: 'KDG', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Sahakaranagar', code: 'SAH', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Hebbal', code: 'HEB', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Vidyaranyapura', code: 'VID', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Doddaballapur', code: 'DDB', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Rajankunte', code: 'RAJ', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Thyagarajanagar', code: 'THY', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Kodichikkanahalli', code: 'KDC', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  // Bangalore South Taluk
  { name: 'JP Nagar', code: 'JPN', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'Jayanagar', code: 'JYG', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'BTM Layout', code: 'BTM', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'Banashankari', code: 'BNS', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'Kumaraswamy Layout', code: 'KML', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'Bommanahalli', code: 'BOM', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'HSR Layout', code: 'HSR', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'Electronic City', code: 'ELC', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'Anekal', code: 'ANK', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'Bannerghatta', code: 'BAN', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  // Bangalore East Taluk
  { name: 'Whitefield', code: 'WHT', district: 'Bangalore Urban', taluk: 'Bangalore East' },
  { name: 'Marathahalli', code: 'MRT', district: 'Bangalore Urban', taluk: 'Bangalore East' },
  { name: 'KR Puram', code: 'KRP', district: 'Bangalore Urban', taluk: 'Bangalore East' },
  { name: 'Mahadevapura', code: 'MHD', district: 'Bangalore Urban', taluk: 'Bangalore East' },
  { name: 'Varthur', code: 'VRT', district: 'Bangalore Urban', taluk: 'Bangalore East' },
  { name: 'Sarjapur', code: 'SAR', district: 'Bangalore Urban', taluk: 'Bangalore East' },
  { name: 'Devanahalli', code: 'DEV', district: 'Bangalore Urban', taluk: 'Bangalore East' },
  { name: 'Hoskote', code: 'HSK', district: 'Bangalore Urban', taluk: 'Bangalore East' },
  { name: 'Nelamangala', code: 'NLM', district: 'Bangalore Urban', taluk: 'Bangalore East' },
  { name: 'Kadugodi', code: 'KDG', district: 'Bangalore Urban', taluk: 'Bangalore East' },

  // ── Bangalore Rural District ──────────────────────────────────────────────
  // Devanahalli Taluk
  { name: 'Devanahalli Town', code: 'DVT', district: 'Bangalore Rural', taluk: 'Devanahalli' },
  { name: 'Chikkaballapur', code: 'CKB', district: 'Bangalore Rural', taluk: 'Devanahalli' },
  { name: 'Nandi Hills', code: 'NDH', district: 'Bangalore Rural', taluk: 'Devanahalli' },
  { name: 'Vijayanagar', code: 'VJN', district: 'Bangalore Rural', taluk: 'Devanahalli' },
  { name: 'Muddenahalli', code: 'MDD', district: 'Bangalore Rural', taluk: 'Devanahalli' },
  // Hoskote Taluk
  { name: 'Hoskote Town', code: 'HKT', district: 'Bangalore Rural', taluk: 'Hoskote' },
  { name: 'Bidadi', code: 'BID', district: 'Bangalore Rural', taluk: 'Hoskote' },
  { name: 'Malur', code: 'MLR', district: 'Bangalore Rural', taluk: 'Hoskote' },
  { name: 'Bangarpet', code: 'BGP', district: 'Bangalore Rural', taluk: 'Hoskote' },
  { name: 'Kolar', code: 'KLR', district: 'Bangalore Rural', taluk: 'Hoskote' },
  // Nelamangala Taluk
  { name: 'Nelamangala Town', code: 'NMT', district: 'Bangalore Rural', taluk: 'Nelamangala' },
  { name: 'Kodigenahalli', code: 'KDG', district: 'Bangalore Rural', taluk: 'Nelamangala' },
  { name: 'Doddaballapur Town', code: 'DBT', district: 'Bangalore Rural', taluk: 'Nelamangala' },
  { name: 'Ramanagara', code: 'RMG', district: 'Bangalore Rural', taluk: 'Nelamangala' },
  { name: 'Channapatna', code: 'CPT', district: 'Bangalore Rural', taluk: 'Nelamangala' },

  // ── Mysore District ───────────────────────────────────────────────────────
  // Mysore Taluk
  { name: 'Mysore City', code: 'MYC', district: 'Mysore', taluk: 'Mysore' },
  { name: 'Saraswathipuram', code: 'SRS', district: 'Mysore', taluk: 'Mysore' },
  { name: 'Vani Vilas Mohana', code: 'VVM', district: 'Mysore', taluk: 'Mysore' },
  { name: 'Jayalakshmipuram', code: 'JLP', district: 'Mysore', taluk: 'Mysore' },
  { name: 'Siddarthanagar', code: 'SDN', district: 'Mysore', taluk: 'Mysore' },
  { name: 'Hunasikeri', code: 'HNS', district: 'Mysore', taluk: 'Mysore' },
  { name: 'Krishnamurthypuram', code: 'KMP', district: 'Mysore', taluk: 'Mysore' },
  { name: 'Srirampura', code: 'SRP', district: 'Mysore', taluk: 'Mysore' },
  // Nanjangud Taluk
  { name: 'Nanjangud', code: 'NJD', district: 'Mysore', taluk: 'Nanjangud' },
  { name: 'Sargur', code: 'SRG', district: 'Mysore', taluk: 'Nanjangud' },
  { name: 'Chamarajanagar', code: 'CMR', district: 'Mysore', taluk: 'Nanjangud' },
  { name: 'Gundlupet', code: 'GND', district: 'Mysore', taluk: 'Nanjangud' },
  { name: 'Yelandur', code: 'YLN', district: 'Mysore', taluk: 'Nanjangud' },
  { name: 'Kollegal', code: 'KLL', district: 'Mysore', taluk: 'Nanjangud' },
  // Hunsur Taluk
  { name: 'Hunsur', code: 'HNS', district: 'Mysore', taluk: 'Hunsur' },
  { name: 'Periyapatna', code: 'PRP', district: 'Mysore', taluk: 'Hunsur' },
  { name: 'KR Nagar', code: 'KRN', district: 'Mysore', taluk: 'Hunsur' },
  { name: 'Saligrama', code: 'SLG', district: 'Mysore', taluk: 'Hunsur' },
  { name: 'Tirumakudal Narsipur', code: 'TMN', district: 'Mysore', taluk: 'Hunsur' },
  // Piriyapatna Taluk
  { name: 'Piriyapatna', code: 'PRP', district: 'Mysore', taluk: 'Piriyapatna' },
  { name: 'Heggaddevankote', code: 'HGK', district: 'Mysore', taluk: 'Piriyapatna' },
  { name: 'Nanjungud Town', code: 'NJT', district: 'Mysore', taluk: 'Piriyapatna' },

  // ── Mandya District ───────────────────────────────────────────────────────
  // Mandya Taluk
  { name: 'Mandya', code: 'MND', district: 'Mandya', taluk: 'Mandya' },
  { name: 'Srirangapatna', code: 'SRP', district: 'Mandya', taluk: 'Mandya' },
  { name: 'Pandavapura', code: 'PDV', district: 'Mandya', taluk: 'Mandya' },
  { name: 'Shravanabelagola', code: 'SHB', district: 'Mandya', taluk: 'Mandya' },
  { name: 'Krishnarajpet', code: 'KRP', district: 'Mandya', taluk: 'Mandya' },
  // Maddur Taluk
  { name: 'Maddur', code: 'MDD', district: 'Mandya', taluk: 'Maddur' },
  { name: 'Malavalli', code: 'MLV', district: 'Mandya', taluk: 'Maddur' },
  { name: 'Kollegal Town', code: 'KLT', district: 'Mandya', taluk: 'Maddur' },
  // Nagamangala Taluk
  { name: 'Nagamangala', code: 'NGM', district: 'Mandya', taluk: 'Nagamangala' },
  { name: 'Srirangapatna Town', code: 'SRT', district: 'Mandya', taluk: 'Nagamangala' },

  // ── Hassan District ───────────────────────────────────────────────────────
  // Hassan Taluk
  { name: 'Hassan', code: 'HSS', district: 'Hassan', taluk: 'Hassan' },
  { name: 'Arsikere', code: 'ASK', district: 'Hassan', taluk: 'Hassan' },
  { name: 'Belur', code: 'BLR', district: 'Hassan', taluk: 'Hassan' },
  { name: 'Halebidu', code: 'HLD', district: 'Hassan', taluk: 'Hassan' },
  { name: 'Chikkamagaluru', code: 'CKM', district: 'Hassan', taluk: 'Hassan' },
  // Arsikere Taluk
  { name: 'Arsikere Town', code: 'AST', district: 'Hassan', taluk: 'Arsikere' },
  { name: 'Holenarsipur', code: 'HLP', district: 'Hassan', taluk: 'Arsikere' },
  { name: 'Arkalgud', code: 'AKG', district: 'Hassan', taluk: 'Arsikere' },
  // Belur Taluk
  { name: 'Belur Town', code: 'BLT', district: 'Hassan', taluk: 'Belur' },
  { name: 'Chiknayakanhalli', code: 'CNK', district: 'Hassan', taluk: 'Belur' },
  // Hassan Taluk (additional)
  { name: 'Alur', code: 'ALR', district: 'Hassan', taluk: 'Hassan' },
  { name: 'Sakleshpur', code: 'SKP', district: 'Hassan', taluk: 'Hassan' },

  // ── Dharwad District ──────────────────────────────────────────────────────
  // Dharwad Taluk
  { name: 'Dharwad', code: 'DWD', district: 'Dharwad', taluk: 'Dharwad' },
  { name: 'Hubli', code: 'HBL', district: 'Dharwad', taluk: 'Dharwad' },
  { name: 'Kalghatgi', code: 'KLG', district: 'Dharwad', taluk: 'Dharwad' },
  { name: 'Navalgund', code: 'NLG', district: 'Dharwad', taluk: 'Dharwad' },
  { name: 'Annigeri', code: 'ANG', district: 'Dharwad', taluk: 'Dharwad' },
  // Kundgol Taluk
  { name: 'Kundgol', code: 'KNG', district: 'Dharwad', taluk: 'Kundgol' },
  { name: 'Haveri', code: 'HVR', district: 'Dharwad', taluk: 'Kundgol' },
  { name: 'Shiggaon', code: 'SHG', district: 'Dharwad', taluk: 'Kundgol' },
  // Hubli Taluk
  { name: 'Hubli City', code: 'HBC', district: 'Dharwad', taluk: 'Hubli' },
  { name: 'Dharwad Town', code: 'DWT', district: 'Dharwad', taluk: 'Hubli' },
  { name: 'Tarihal', code: 'TRH', district: 'Dharwad', taluk: 'Hubli' },
  { name: 'Gokul Road', code: 'GKR', district: 'Dharwad', taluk: 'Hubli' },

  // ── Belgaum District ──────────────────────────────────────────────────────
  // Belgaum Taluk
  { name: 'Belgaum', code: 'BLG', district: 'Belgaum', taluk: 'Belgaum' },
  { name: 'Sambra', code: 'SMB', district: 'Belgaum', taluk: 'Belgaum' },
  { name: 'Kangrali', code: 'KNG', district: 'Belgaum', taluk: 'Belgaum' },
  { name: 'Bailhongal', code: 'BLH', district: 'Belgaum', taluk: 'Belgaum' },
  { name: 'Saundatti', code: 'SDT', district: 'Belgaum', taluk: 'Belgaum' },
  // Khanapur Taluk
  { name: 'Khanapur', code: 'KNP', district: 'Belgaum', taluk: 'Khanapur' },
  { name: 'Haliyal', code: 'HLY', district: 'Belgaum', taluk: 'Khanapur' },
  { name: 'Yellapur', code: 'YLP', district: 'Belgaum', taluk: 'Khanapur' },
  // Gokak Taluk
  { name: 'Gokak', code: 'GKK', district: 'Belgaum', taluk: 'Gokak' },
  { name: 'Yadgir', code: 'YDR', district: 'Belgaum', taluk: 'Gokak' },
  { name: 'Shahpur', code: 'SHP', district: 'Belgaum', taluk: 'Gokak' },
  // Ramdurg Taluk
  { name: 'Ramdurg', code: 'RMD', district: 'Belgaum', taluk: 'Ramdurg' },
  { name: 'Savadatti', code: 'SVT', district: 'Belgaum', taluk: 'Ramdurg' },

  // ── Gulbarga District ─────────────────────────────────────────────────────
  // Gulbarga Taluk
  { name: 'Gulbarga', code: 'GLB', district: 'Gulbarga', taluk: 'Gulbarga' },
  { name: 'Aland', code: 'ALD', district: 'Gulbarga', taluk: 'Gulbarga' },
  { name: 'Chincholi', code: 'CHZ', district: 'Gulbarga', taluk: 'Gulbarga' },
  { name: 'Jevargi', code: 'JVG', district: 'Gulbarga', taluk: 'Gulbarga' },
  { name: 'Shahabad', code: 'SHD', district: 'Gulbarga', taluk: 'Gulbarga' },
  // Yadgir Taluk
  { name: 'Yadgir', code: 'YGD', district: 'Gulbarga', taluk: 'Yadgir' },
  { name: 'Shahpur Town', code: 'SPT', district: 'Gulbarga', taluk: 'Yadgir' },
  { name: 'Surpur', code: 'SRP', district: 'Gulbarga', taluk: 'Yadgir' },
  // Sedam Taluk
  { name: 'Sedam', code: 'SDM', district: 'Gulbarga', taluk: 'Sedam' },
  { name: 'Chitapur', code: 'CTP', district: 'Gulbarga', taluk: 'Sedam' },

  // ── Bijapur District ──────────────────────────────────────────────────────
  // Bijapur Taluk
  { name: 'Bijapur', code: 'BJP', district: 'Bijapur', taluk: 'Bijapur' },
  { name: 'Indi', code: 'IND', district: 'Bijapur', taluk: 'Bijapur' },
  { name: 'Sindgi', code: 'SNG', district: 'Bijapur', taluk: 'Bijapur' },
  { name: 'Basavana Bagewadi', code: 'BBG', district: 'Bijapur', taluk: 'Bijapur' },
  { name: 'Muddebihal', code: 'MDB', district: 'Bijapur', taluk: 'Bijapur' },
  // Bagalkot Taluk
  { name: 'Bagalkot', code: 'BGK', district: 'Bijapur', taluk: 'Bagalkot' },
  { name: 'Ilakal', code: 'ILK', district: 'Bijapur', taluk: 'Bagalkot' },
  { name: 'Hunagund', code: 'HNG', district: 'Bijapur', taluk: 'Bagalkot' },

  // ── Shimoga District ──────────────────────────────────────────────────────
  // Shimoga Taluk
  { name: 'Shimoga', code: 'SMG', district: 'Shimoga', taluk: 'Shimoga' },
  { name: 'Bhadravati', code: 'BDV', district: 'Shimoga', taluk: 'Shimoga' },
  { name: 'Sagar', code: 'SGR', district: 'Shimoga', taluk: 'Shimoga' },
  { name: 'Tirthahalli', code: 'TRT', district: 'Shimoga', taluk: 'Shimoga' },
  { name: 'Shikaripura', code: 'SKP', district: 'Shimoga', taluk: 'Shimoga' },
  // Sorab Taluk
  { name: 'Sorab', code: 'SRB', district: 'Shimoga', taluk: 'Sorab' },
  { name: 'Shimoga Town', code: 'SMT', district: 'Shimoga', taluk: 'Sorab' },
  // Sagara Taluk
  { name: 'Sagara Town', code: 'SGT', district: 'Shimoga', taluk: 'Sagara' },
  { name: 'Hosanagar', code: 'HSN', district: 'Shimoga', taluk: 'Sagara' },
  { name: 'Thirthahalli Town', code: 'TRT', district: 'Shimoga', taluk: 'Sagara' },

  // ── Udupi District ────────────────────────────────────────────────────────
  // Udupi Taluk
  { name: 'Udupi', code: 'UDP', district: 'Udupi', taluk: 'Udupi' },
  { name: 'Manipal', code: 'MNP', district: 'Udupi', taluk: 'Udupi' },
  { name: 'Kundapur', code: 'KND', district: 'Udupi', taluk: 'Udupi' },
  { name: 'Karkala', code: 'KRL', district: 'Udupi', taluk: 'Udupi' },
  { name: 'Barkur', code: 'BKR', district: 'Udupi', taluk: 'Udupi' },
  // Karkala Taluk
  { name: 'Karkala Town', code: 'KKT', district: 'Udupi', taluk: 'Karkala' },
  { name: 'Nitte', code: 'NTT', district: 'Udupi', taluk: 'Karkala' },
  { name: 'Venur', code: 'VNR', district: 'Udupi', taluk: 'Karkala' },

  // ── Dakshina Kannada District ─────────────────────────────────────────────
  // Mangalore Taluk
  { name: 'Mangalore', code: 'MNG', district: 'Dakshina Kannada', taluk: 'Mangalore' },
  { name: 'Surathkal', code: 'SRT', district: 'Dakshina Kannada', taluk: 'Mangalore' },
  { name: 'Mulki', code: 'MLK', district: 'Dakshina Kannada', taluk: 'Mangalore' },
  { name: 'Panambur', code: 'PNB', district: 'Dakshina Kannada', taluk: 'Mangalore' },
  { name: 'Kankanady', code: 'KNK', district: 'Dakshina Kannada', taluk: 'Mangalore' },
  // Puttur Taluk
  { name: 'Puttur', code: 'PTR', district: 'Dakshina Kannada', taluk: 'Puttur' },
  { name: 'Sullia', code: 'SLA', district: 'Dakshina Kannada', taluk: 'Puttur' },
  { name: 'Bantwal', code: 'BNW', district: 'Dakshina Kannada', taluk: 'Puttur' },
  { name: 'Kadaba', code: 'KDB', district: 'Dakshina Kannada', taluk: 'Puttur' },
  // Belthangady Taluk
  { name: 'Belthangady', code: 'BLT', district: 'Dakshina Kannada', taluk: 'Belthangady' },
  { name: 'Moodbidri', code: 'MBR', district: 'Dakshina Kannada', taluk: 'Belthangady' },
  { name: 'Dharmasthala', code: 'DHM', district: 'Dakshina Kannada', taluk: 'Belthangady' },

  // ── Bellary District ──────────────────────────────────────────────────────
  // Bellary Taluk
  { name: 'Bellary', code: 'BLR', district: 'Bellary', taluk: 'Bellary' },
  { name: 'Hospet', code: 'HSP', district: 'Bellary', taluk: 'Bellary' },
  { name: 'Sandur', code: 'SND', district: 'Bellary', taluk: 'Bellary' },
  { name: 'Kudligi', code: 'KDG', district: 'Bellary', taluk: 'Bellary' },
  { name: 'Babooji', code: 'BBJ', district: 'Bellary', taluk: 'Bellary' },
  // Hospet Taluk
  { name: 'Hospet Town', code: 'HPT', district: 'Bellary', taluk: 'Hospet' },
  { name: 'Kotturu', code: 'KTR', district: 'Bellary', taluk: 'Hospet' },
  { name: 'Huvina Hadagali', code: 'HVH', district: 'Bellary', taluk: 'Hospet' },

  // ── Raichur District ──────────────────────────────────────────────────────
  // Raichur Taluk
  { name: 'Raichur', code: 'RCR', district: 'Raichur', taluk: 'Raichur' },
  { name: 'Yadgir Town', code: 'YGT', district: 'Raichur', taluk: 'Raichur' },
  { name: 'Sedam Town', code: 'SDT', district: 'Raichur', taluk: 'Raichur' },
  { name: 'Devadurga', code: 'DVD', district: 'Raichur', taluk: 'Raichur' },
  { name: 'Lingasugur', code: 'LNG', district: 'Raichur', taluk: 'Raichur' },
  // Manvi Taluk
  { name: 'Manvi', code: 'MNV', district: 'Raichur', taluk: 'Manvi' },
  { name: 'Raichur Town', code: 'RCT', district: 'Raichur', taluk: 'Manvi' },
  { name: 'Sindhanur', code: 'SDR', district: 'Raichur', taluk: 'Manvi' },

  // ── Koppal District ───────────────────────────────────────────────────────
  // Koppal Taluk
  { name: 'Koppal', code: 'KPL', district: 'Koppal', taluk: 'Koppal' },
  { name: 'Gangavathi', code: 'GGV', district: 'Koppal', taluk: 'Koppal' },
  { name: 'Yelburga', code: 'YBG', district: 'Koppal', taluk: 'Koppal' },
  { name: 'Kushtagi', code: 'KST', district: 'Koppal', taluk: 'Koppal' },
  { name: 'Gangavathi Town', code: 'GGT', district: 'Koppal', taluk: 'Koppal' },

  // ── Gadag District ────────────────────────────────────────────────────────
  // Gadag Taluk
  { name: 'Gadag', code: 'GDG', district: 'Gadag', taluk: 'Gadag' },
  { name: 'Betageri', code: 'BTG', district: 'Gadag', taluk: 'Gadag' },
  { name: 'Nargund', code: 'NRG', district: 'Gadag', taluk: 'Gadag' },
  { name: 'Ron', code: 'RON', district: 'Gadag', taluk: 'Gadag' },
  { name: 'Mundargi', code: 'MND', district: 'Gadag', taluk: 'Gadag' },
  // Shirhatti Taluk
  { name: 'Shirhatti', code: 'SHT', district: 'Gadag', taluk: 'Shirhatti' },
  { name: 'Lakshmeshwar', code: 'LKM', district: 'Gadag', taluk: 'Shirhatti' },

  // ── Bagalkot District ─────────────────────────────────────────────────────
  // Bagalkot Taluk
  { name: 'Bagalkot Town', code: 'BGT', district: 'Bagalkot', taluk: 'Bagalkot' },
  { name: 'Bilgi', code: 'BLG', district: 'Bagalkot', taluk: 'Bagalkot' },
  { name: 'Badami', code: 'BDM', district: 'Bagalkot', taluk: 'Bagalkot' },
  { name: 'Pattadakal', code: 'PTD', district: 'Bagalkot', taluk: 'Bagalkot' },
  { name: 'Aihole', code: 'AHL', district: 'Bagalkot', taluk: 'Bagalkot' },
  // Hungund Taluk
  { name: 'Hungund', code: 'HNG', district: 'Bagalkot', taluk: 'Hungund' },
  { name: 'Mudhol', code: 'MDL', district: 'Bagalkot', taluk: 'Hungund' },
  { name: 'Jamkhandi', code: 'JMK', district: 'Bagalkot', taluk: 'Hungund' },

  // ── Vijayapura District ───────────────────────────────────────────────────
  // Vijayapura Taluk
  { name: 'Vijayapura', code: 'VJP', district: 'Vijayapura', taluk: 'Vijayapura' },
  { name: 'Basava Kalyan', code: 'BSK', district: 'Vijayapura', taluk: 'Vijayapura' },
  { name: 'Talikote', code: 'TLK', district: 'Vijayapura', taluk: 'Vijayapura' },
  { name: 'Nalatwad', code: 'NLT', district: 'Vijayapura', taluk: 'Vijayapura' },
  { name: 'Devara Hippargi', code: 'DHP', district: 'Vijayapura', taluk: 'Vijayapura' },

  // ── Chitradurga District ──────────────────────────────────────────────────
  // Chitradurga Taluk
  { name: 'Chitradurga', code: 'CTD', district: 'Chitradurga', taluk: 'Chitradurga' },
  { name: 'Hiriyur', code: 'HRY', district: 'Chitradurga', taluk: 'Chitradurga' },
  { name: 'Holalkere', code: 'HLK', district: 'Chitradurga', taluk: 'Chitradurga' },
  { name: 'Challakere', code: 'CLK', district: 'Chitradurga', taluk: 'Chitradurga' },
  { name: 'Molakalmuru', code: 'MLK', district: 'Chitradurga', taluk: 'Chitradurga' },
  // Hosadurga Taluk
  { name: 'Hosadurga', code: 'HSD', district: 'Chitradurga', taluk: 'Hosadurga' },
  { name: 'Siggar', code: 'SGG', district: 'Chitradurga', taluk: 'Hosadurga' },

  // ── Davanagere District ───────────────────────────────────────────────────
  // Davanagere Taluk
  { name: 'Davanagere', code: 'DVG', district: 'Davanagere', taluk: 'Davanagere' },
  { name: 'Chennagiri', code: 'CNG', district: 'Davanagere', taluk: 'Davanagere' },
  { name: 'Harihar', code: 'HRH', district: 'Davanagere', taluk: 'Davanagere' },
  { name: 'Honnali', code: 'HNL', district: 'Davanagere', taluk: 'Davanagere' },
  { name: 'Japakal', code: 'JPK', district: 'Davanagere', taluk: 'Davanagere' },
  // Mayakonda Taluk
  { name: 'Mayakonda', code: 'MYK', district: 'Davanagere', taluk: 'Mayakonda' },
  { name: 'Nittur', code: 'NTR', district: 'Davanagere', taluk: 'Mayakonda' },

  // ── Chamarajanagar District ───────────────────────────────────────────────
  // Chamarajanagar Taluk
  { name: 'Chamarajanagar', code: 'CMN', district: 'Chamarajanagar', taluk: 'Chamarajanagar' },
  { name: 'Gundlupet Town', code: 'GLP', district: 'Chamarajanagar', taluk: 'Chamarajanagar' },
  { name: 'Yelandur Town', code: 'YLT', district: 'Chamarajanagar', taluk: 'Chamarajanagar' },
  { name: 'Kollegal Town', code: 'KLT', district: 'Chamarajanagar', taluk: 'Chamarajanagar' },
  // Hanur Taluk
  { name: 'Hanur', code: 'HNR', district: 'Chamarajanagar', taluk: 'Hanur' },
  { name: 'Sargur Town', code: 'SGT', district: 'Chamarajanagar', taluk: 'Hanur' },

  // ── Kodagu District ───────────────────────────────────────────────────────
  // Madikeri Taluk
  { name: 'Madikeri', code: 'MDK', district: 'Kodagu', taluk: 'Madikeri' },
  { name: 'Kushalnagar', code: 'KSN', district: 'Kodagu', taluk: 'Madikeri' },
  { name: 'Somwarpet', code: 'SMP', district: 'Kodagu', taluk: 'Madikeri' },
  { name: 'Virajpet', code: 'VRJ', district: 'Kodagu', taluk: 'Madikeri' },
  { name: 'Gonikoppal', code: 'GNK', district: 'Kodagu', taluk: 'Madikeri' },

  // ── Chikkamagaluru District ───────────────────────────────────────────────
  // Chikkamagaluru Taluk
  { name: 'Chikkamagaluru', code: 'CKG', district: 'Chikkamagaluru', taluk: 'Chikkamagaluru' },
  { name: 'Koppa', code: 'KPA', district: 'Chikkamagaluru', taluk: 'Chikkamagaluru' },
  { name: 'Narasimharajapura', code: 'NRP', district: 'Chikkamagaluru', taluk: 'Chikkamagaluru' },
  { name: 'Kadur', code: 'KDR', district: 'Chikkamagaluru', taluk: 'Chikkamagaluru' },
  { name: 'Mudigere', code: 'MDG', district: 'Chikkamagaluru', taluk: 'Chikkamagaluru' },
  // Tarikere Taluk
  { name: 'Tarikere', code: 'TRK', district: 'Chikkamagaluru', taluk: 'Tarikere' },
  { name: 'Ayyanahalli', code: 'AYN', district: 'Chikkamagaluru', taluk: 'Tarikere' },

  // ── Tumkur District ───────────────────────────────────────────────────────
  // Tumkur Taluk
  { name: 'Tumkur', code: 'TMK', district: 'Tumkur', taluk: 'Tumkur' },
  { name: 'Koratagere', code: 'KRG', district: 'Tumkur', taluk: 'Tumkur' },
  { name: 'Madhugiri', code: 'MDG', district: 'Tumkur', taluk: 'Tumkur' },
  { name: 'Sira', code: 'SRA', district: 'Tumkur', taluk: 'Tumkur' },
  { name: 'Pavagada', code: 'PVG', district: 'Tumkur', taluk: 'Tumkur' },
  // Gubbi Taluk
  { name: 'Gubbi', code: 'GBI', district: 'Tumkur', taluk: 'Gubbi' },
  { name: 'Tiptur', code: 'TPT', district: 'Tumkur', taluk: 'Gubbi' },
  { name: 'Kunigal', code: 'KNG', district: 'Tumkur', taluk: 'Gubbi' },

  // ── Kolar District ────────────────────────────────────────────────────────
  // Kolar Taluk
  { name: 'Kolar', code: 'KLR', district: 'Kolar', taluk: 'Kolar' },
  { name: 'Bangarpet', code: 'BGP', district: 'Kolar', taluk: 'Kolar' },
  { name: 'Mulbagal', code: 'MLB', district: 'Kolar', taluk: 'Kolar' },
  { name: 'Srinivaspur', code: 'SRP', district: 'Kolar', taluk: 'Kolar' },
  { name: 'Kolar Gold Fields', code: 'KGF', district: 'Kolar', taluk: 'Kolar' },
  // Malur Taluk
  { name: 'Malur', code: 'MLR', district: 'Kolar', taluk: 'Malur' },
  { name: 'Bangarpet Town', code: 'BGT', district: 'Kolar', taluk: 'Malur' },

  // ── Chikkaballapur District ───────────────────────────────────────────────
  // Chikkaballapur Taluk
  { name: 'Chikkaballapur', code: 'CKP', district: 'Chikkaballapur', taluk: 'Chikkaballapur' },
  { name: 'Sidlaghatta', code: 'SDL', district: 'Chikkaballapur', taluk: 'Chikkaballapur' },
  { name: 'Chintamani', code: 'CNT', district: 'Chikkaballapur', taluk: 'Chikkaballapur' },
  { name: 'Bagepalli', code: 'BGP', district: 'Chikkaballapur', taluk: 'Chikkaballapur' },
  { name: 'Gauribidanur', code: 'GRB', district: 'Chikkaballapur', taluk: 'Chikkaballapur' },

  // ── Ramanagara District ───────────────────────────────────────────────────
  // Ramanagara Taluk
  { name: 'Ramanagara', code: 'RMG', district: 'Ramanagara', taluk: 'Ramanagara' },
  { name: 'Channapatna', code: 'CPT', district: 'Ramanagara', taluk: 'Ramanagara' },
  { name: 'Kanakapura', code: 'KNK', district: 'Ramanagara', taluk: 'Ramanagara' },
  { name: 'Magadi', code: 'MGD', district: 'Ramanagara', taluk: 'Ramanagara' },
  { name: 'Harohalli', code: 'HRL', district: 'Ramanagara', taluk: 'Ramanagara' },

  // ── Yadgir District ───────────────────────────────────────────────────────
  // Yadgir Taluk
  { name: 'Yadgir Town', code: 'YGT', district: 'Yadgir', taluk: 'Yadgir' },
  { name: 'Shahpur Town', code: 'SPT', district: 'Yadgir', taluk: 'Yadgir' },
  { name: 'Surpur Town', code: 'SRP', district: 'Yadgir', taluk: 'Yadgir' },
  { name: 'Shorapur', code: 'SRP', district: 'Yadgir', taluk: 'Yadgir' },
  { name: 'Wadagera', code: 'WDG', district: 'Yadgir', taluk: 'Yadgir' },

  // ── Bidar District ────────────────────────────────────────────────────────
  // Bidar Taluk
  { name: 'Bidar', code: 'BDR', district: 'Bidar', taluk: 'Bidar' },
  { name: 'Aurad', code: 'ARD', district: 'Bidar', taluk: 'Bidar' },
  { name: 'Bhalki', code: 'BHK', district: 'Bidar', taluk: 'Bidar' },
  { name: 'Basavakalyan', code: 'BSK', district: 'Bidar', taluk: 'Bidar' },
  { name: 'Humnabad', code: 'HMB', district: 'Bidar', taluk: 'Bidar' },
  // Humnabad Taluk
  { name: 'Humnabad Town', code: 'HMT', district: 'Bidar', taluk: 'Humnabad' },
  { name: 'Chitguppa', code: 'CTG', district: 'Bidar', taluk: 'Humnabad' },

  // ── Haveri District ───────────────────────────────────────────────────────
  // Haveri Taluk
  { name: 'Haveri', code: 'HVR', district: 'Haveri', taluk: 'Haveri' },
  { name: 'Ranebennur', code: 'RNB', district: 'Haveri', taluk: 'Haveri' },
  { name: 'Harihar', code: 'HRH', district: 'Haveri', taluk: 'Haveri' },
  { name: 'Byadgi', code: 'BYD', district: 'Haveri', taluk: 'Haveri' },
  { name: 'Hirekerur', code: 'HKR', district: 'Haveri', taluk: 'Haveri' },
  // Shiggaon Taluk
  { name: 'Shiggaon', code: 'SHG', district: 'Haveri', taluk: 'Shiggaon' },
  { name: 'Savanur', code: 'SVN', district: 'Haveri', taluk: 'Shiggaon' },

  // ── Uttara Kannada District ───────────────────────────────────────────────
  // Karwar Taluk
  { name: 'Karwar', code: 'KRW', district: 'Uttara Kannada', taluk: 'Karwar' },
  { name: 'Ankola', code: 'ANK', district: 'Uttara Kannada', taluk: 'Karwar' },
  { name: 'Kumta', code: 'KMT', district: 'Uttara Kannada', taluk: 'Karwar' },
  { name: 'Honnavar', code: 'HNV', district: 'Uttara Kannada', taluk: 'Karwar' },
  { name: 'Bhatkal', code: 'BTK', district: 'Uttara Kannada', taluk: 'Karwar' },
  // Sirsi Taluk
  { name: 'Sirsi', code: 'SRS', district: 'Uttara Kannada', taluk: 'Sirsi' },
  { name: 'Yellapur', code: 'YLP', district: 'Uttara Kannada', taluk: 'Sirsi' },
  { name: 'Haliyal', code: 'HLY', district: 'Uttara Kannada', taluk: 'Sirsi' },
  { name: 'Supa', code: 'SUP', district: 'Uttara Kannada', taluk: 'Sirsi' },

  // ── Dakshina Kannada District (additional) ────────────────────────────────
  // Sullia Taluk
  { name: 'Sullia Town', code: 'SLT', district: 'Dakshina Kannada', taluk: 'Sullia' },
  { name: 'Kokkada', code: 'KKD', district: 'Dakshina Kannada', taluk: 'Sullia' },
  { name: 'Mercara', code: 'MRC', district: 'Dakshina Kannada', taluk: 'Sullia' },

  // ── Additional Important Towns ────────────────────────────────────────────
  // Bangalore Urban (additional)
  { name: 'Rajajinagar', code: 'RJN', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Malleshwaram', code: 'MLW', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Basavanagudi', code: 'BSG', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'Fort', code: 'FRT', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'City Market', code: 'CTM', district: 'Bangalore Urban', taluk: 'Bangalore South' },
  { name: 'Shivajinagar', code: 'SHJ', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Frazer Town', code: 'FZT', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Cox Town', code: 'CXT', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Benson Town', code: 'BST', district: 'Bangalore Urban', taluk: 'Bangalore North' },
  { name: 'Pulakeshinagar', code: 'PLK', district: 'Bangalore Urban', taluk: 'Bangalore North' },
];

const FIRST_NAMES = ['Rahul', 'Priya', 'Amit', 'Sunita', 'Vijay', 'Anita', 'Ramesh', 'Kavita', 'Suresh', 'Meena', 'Arjun', 'Pooja'];
const LAST_NAMES = ['Kumar', 'Sharma', 'Patel', 'Reddy', 'Singh', 'Das', 'Nair', 'Yadav'];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function seedSuperadmin(db: AppDatabase, email: string, password: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  const [existing] = await db.select().from(admins).where(eq(admins.email, normalized)).limit(1);
  if (existing) {
    // Reconcile the password + active flag so the documented seed credentials
    // always authenticate against the live DB (idempotent across re-seeds).
    await db.update(admins).set({ passwordHash, isActive: true }).where(eq(admins.id, existing.id));
    log.log(`Superadmin exists (${normalized}) — password reconciled to SEED_SUPERADMIN_PASSWORD`);
    return existing.id;
  }
  const [created] = await db
    .insert(admins)
    .values({
      name: 'Super Admin',
      email: normalized,
      passwordHash,
      role: 'superadmin',
      assignedVillages: [],
      isActive: true,
    })
    .returning();
  log.log(`Created superadmin ${normalized}`);
  return created.id;
}

/**
 * Persist the bank's default pigmy scheme. Accounts snapshot these terms at
 * opening, so this must run BEFORE any account is created — otherwise the first
 * accounts fall back to DEFAULT_SCHEME and could drift from the saved row.
 */
async function seedScheme(db: AppDatabase, adminId: string) {
  const [existing] = await db.select({ id: schemeSettings.id }).from(schemeSettings).limit(1);
  if (existing) {
    log.log('Scheme settings already exist — skipping scheme seed');
    return;
  }
  await db.insert(schemeSettings).values({ ...DEFAULT_SCHEME, updatedById: adminId });
  log.log(
    `Created scheme: ${DEFAULT_SCHEME.termDays}-day term, ` +
      `${DEFAULT_SCHEME.interestRateBps / 100}% p.a., ` +
      `early withdrawal ${DEFAULT_SCHEME.earlyWithdrawalAllowed ? 'allowed' : 'blocked'} ` +
      `with a ${DEFAULT_SCHEME.earlyPenaltyBps / 100}% penalty`,
  );
}

async function seedVillages(db: AppDatabase): Promise<string[]> {
  const existing = await db.select().from(villages);
  if (existing.length > 0) {
    log.log(`${existing.length} villages already exist — skipping village seed`);
    return existing.map((v) => v.id);
  }
  const ids: string[] = [];
  for (const v of VILLAGES) {
    const [row] = await db.insert(villages).values(v).returning();
    ids.push(row.id);
    log.log(`Created village ${v.name} (${v.code})`);
  }
  return ids;
}

async function seedCustomersAndDeposits(
  db: AppDatabase,
  customersSvc: CustomersService,
  paymentsSvc: PaymentsService,
  villageIds: string[],
) {
  const existing = await db.select({ id: customers.id }).from(customers);
  if (existing.length > 0) {
    log.log(`${existing.length} customers already exist — skipping customer/deposit seed`);
    return;
  }

  const TOTAL = 12;
  for (let i = 0; i < TOTAL; i++) {
    const name = `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i)}`;
    const mobile = `9${String(100000000 + i).padStart(9, '0')}`; // 10 digits, starts 9
    const villageId = pick(villageIds, i);
    const dailyAmountRupees = pick([50, 100, 100, 200, 150], i);

    const { customer, account } = await customersSvc.createFromRegistration({
      mobile,
      name,
      villageId,
      dailyAmountRupees,
    });
    log.log(`Customer ${name} (${mobile}) → account ${account.accountNumber}`);

    // Simulate a handful of daily deposits through the real payment flow (mock
    // gateway) so balances are ledger-derived and transactions populate reports.
    const deposits = 2 + (i % 4); // 2..5 deposits
    for (let d = 0; d < deposits; d++) {
      const order = await paymentsSvc.createOrder(customer.id, {});
      if (!order.mock) {
        log.warn('Gateway not in mock mode — cannot auto-settle seed deposits; skipping');
        break;
      }
      await paymentsSvc.verifyPayment(customer.id, {
        orderId: order.orderId,
        paymentId: order.mock.paymentId,
        signature: order.mock.signature,
      });
    }
  }
}

/**
 * Backdate one account so the demo has something at maturity to withdraw from.
 *
 * Only the dates move — the balance is left alone because it is ledger-derived.
 * `maturedAt` is deliberately left NULL so the daily maturity sweep still has
 * work to do (and can be demonstrated) on a freshly seeded database.
 */
async function seedMaturedDemoAccount(db: AppDatabase) {
  const [already] = await db
    .select({ id: pigmyAccounts.id })
    .from(pigmyAccounts)
    .where(lte(pigmyAccounts.maturityDate, new Date()))
    .limit(1);
  if (already) {
    log.log('A matured account already exists — skipping maturity demo seed');
    return;
  }

  const [target] = await db
    .select()
    .from(pigmyAccounts)
    .orderBy(pigmyAccounts.createdAt)
    .limit(1);
  if (!target) return;

  const openedAt = addDays(new Date(), -(target.termDays + 5)); // matured 5 days ago
  await db
    .update(pigmyAccounts)
    .set({
      createdAt: openedAt,
      maturityDate: addDays(openedAt, target.termDays),
      updatedAt: new Date(),
    })
    .where(eq(pigmyAccounts.id, target.id));
  log.log(`Backdated ${target.accountNumber} to matured (demo maturity + interest flow)`);
}

/**
 * Seed an already-running Nest context. Every step is idempotent, so this is
 * safe to call repeatedly — on each boot with SEED_ON_BOOT=true, or by hand via
 * `npm run seed`. The caller owns the context lifecycle and the schema: apply
 * migrations before calling this.
 */
export async function runSeed(app: INestApplicationContext): Promise<void> {
  const db = app.get<AppDatabase>(DATABASE);
  const cfg = app.get(AppConfigService).config;
  const customersSvc = app.get(CustomersService, { strict: false });
  const paymentsSvc = app.get(PaymentsService, { strict: false });

  const superadminId = await seedSuperadmin(db, cfg.seed.email, cfg.seed.password);
  await seedScheme(db, superadminId);
  const villageIds = await seedVillages(db);
  await seedCustomersAndDeposits(db, customersSvc, paymentsSvc, villageIds);
  await seedMaturedDemoAccount(db);

  log.log('Seed complete ✔');
  // Never print the password into a hosted platform's log store.
  log.log(
    cfg.isProd
      ? `  Admin login: ${cfg.seed.email} / (SEED_SUPERADMIN_PASSWORD)`
      : `  Admin login: ${cfg.seed.email} / ${cfg.seed.password}`,
  );
}

/** CLI entrypoint: `npm run seed` → builds its own context, seeds, exits. */
async function main() {
  // Surface anything that would otherwise let the event loop drain silently
  // (e.g. a swallowed rejection deep in the payment/ledger path).
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[seed] UNHANDLED REJECTION', reason);
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] UNCAUGHT EXCEPTION', err);
    process.exit(1);
  });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const bundle = app.get<DbBundle>(DB_BUNDLE);
  await applyMigrations(bundle);
  log.log(`Migrations applied (dialect=${bundle.dialect})`);

  await runSeed(app);

  await app.close();
  process.exit(0);
}

// Only self-execute as a script. Without this guard, importing runSeed from the
// API bootstrap would spin up a second Nest context and exit the process.
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed', err);
    process.exit(1);
  });
}
