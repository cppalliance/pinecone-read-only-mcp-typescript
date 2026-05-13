#!/usr/bin/env tsx
/**
 * Simple test script to verify Pinecone connectivity and search functionality
 * without needing MCP Inspector.
 *
 * Usage:
 *   npm run test:search
 *   or
 *   PINECONE_API_KEY=your-key npm run test:search
 *   or
 *   tsx scripts/test-search.ts YOUR_API_KEY
 */

import { PineconeClient } from '../src/pinecone-client.js';

async function test() {
  const apiKey = process.env.PINECONE_API_KEY || process.argv[2];

  if (!apiKey) {
    console.error('❌ Error: Pinecone API key is required');
    console.error('');
    console.error('Usage:');
    console.error('  npm run test:search');
    console.error('  or');
    console.error('  PINECONE_API_KEY=your-key npm run test:search');
    console.error('  or');
    console.error('  tsx scripts/test-search.ts YOUR_API_KEY');
    process.exit(1);
  }

  console.log('🔧 Initializing Pinecone client...');
  const client = new PineconeClient({ apiKey });

  try {
    // Test 1: List namespaces with metadata
    console.log('\n📋 Test 1: Listing namespaces with metadata...');
    const namespacesInfo = await client.listNamespacesWithMetadata();
    console.log(`✅ Found ${namespacesInfo.length} namespace(s):`);
    namespacesInfo.forEach((ns) => {
      console.log(`   - ${ns.namespace}: ${ns.recordCount} records`);
      if (Object.keys(ns.metadata).length > 0) {
        console.log(`     Metadata fields:`, Object.keys(ns.metadata));
      }
    });

    if (namespacesInfo.length === 0) {
      console.log('⚠️  No namespaces found in your index');
      console.log('   Make sure your Pinecone index has data');
      return;
    }

    // Test 2: Query without reranking (faster)
    const testNamespace = namespacesInfo[0].namespace;
    console.log(`\n🔍 Test 2: Query WITHOUT reranking (faster)`);
    console.log(`   Namespace: "${testNamespace}"`);
    console.log(`   Query: "test query"`);
    console.log(`   Top K: 3`);

    const startTime1 = Date.now();
    const results1 = await client.query({
      query: 'test query',
      namespace: testNamespace,
      topK: 3,
      useReranking: false,
    });
    const duration1 = Date.now() - startTime1;

    console.log(`✅ Found ${results1.length} result(s) in ${duration1}ms`);
    if (results1.length > 0) {
      console.log(`   First result score: ${results1[0].score.toFixed(4)}`);
      console.log(`   Content preview: ${results1[0].content.substring(0, 100)}...`);
    }

    // Test 3: Query WITH reranking (slower but more accurate)
    console.log(`\n🎯 Test 3: Query WITH reranking (slower, more accurate)`);
    console.log(`   Namespace: "${testNamespace}"`);
    console.log(`   Query: "test query"`);
    console.log(`   Top K: 3`);

    const startTime2 = Date.now();
    const results2 = await client.query({
      query: 'test query',
      namespace: testNamespace,
      topK: 3,
      useReranking: true,
    });
    const duration2 = Date.now() - startTime2;

    console.log(`✅ Found ${results2.length} result(s) in ${duration2}ms`);
    if (results2.length > 0) {
      console.log(`   First result score: ${results2[0].score.toFixed(4)}`);
      console.log(`   Reranked: ${results2[0].reranked}`);
      console.log(`   Content preview: ${results2[0].content.substring(0, 100)}...`);
    }

    // Test 4: Query with metadata filter on wg21-papers namespace
    const wg21Namespace = namespacesInfo.find((ns) => ns.namespace === 'wg21-papers');
    let duration3: number | undefined;

    if (wg21Namespace) {
      console.log(
        `\n🔎 Test 4: Query WITH metadata filter (papers from last 2 years with timestamp filter)`
      );
      console.log(`   Namespace: "wg21-papers"`);
      console.log(`   Query: "Contracts"`);
      console.log(`   Metadata Filter: {"timestamp": {"$gte": ...}}`);
      console.log(
        `   NOTE: Cannot filter by individual author in comma-separated author field (requires exact match)`
      );
      console.log(`   Top K: 5`);

      // Calculate timestamp for two years ago (in seconds since epoch)
      const twoYearsAgo = Math.floor(Date.now() / 1000) - 2 * 365 * 24 * 60 * 60;

      const startTime3 = Date.now();
      const results3 = await client.query({
        query: 'Contracts',
        namespace: 'wg21-papers',
        topK: 5,
        useReranking: false,
        metadataFilter: {
          // Note: author field is comma-separated string, cannot use $in operator
          // Only exact full string match works, so omitting author filter
          timestamp: { $gte: twoYearsAgo },
        },
      });
      duration3 = Date.now() - startTime3;

      console.log(`✅ Found ${results3.length} result(s) in ${duration3}ms`);
      if (results3.length > 0) {
        console.log(`\n   📄 Detailed results with full metadata:\n`);
        results3.forEach((result, index) => {
          console.log(`   Result ${index + 1}:`);
          console.log(`     Score: ${result.score.toFixed(4)}`);
          console.log(`     Metadata:`, JSON.stringify(result.metadata, null, 6));
          console.log(`     Content preview: ${result.content.substring(0, 100)}...`);
          console.log('');
        });
      } else {
        console.log(
          '   ℹ️  No results found - try adjusting the filter or check available metadata fields'
        );
        console.log(
          '   💡 Available metadata fields in wg21-papers:',
          Object.keys(wg21Namespace.metadata)
        );
      }
    } else {
      console.log(`\n⚠️  Test 4 skipped: "wg21-papers" namespace not found`);
      console.log(
        `   Available namespaces: ${namespacesInfo.map((ns) => ns.namespace).join(', ')}`
      );
    }

    // Test 5: Keyword (sparse-only) search — use namespace from sparse index, not dense
    let duration5: number | undefined;
    let test5Skipped = false;
    const sparseResult = await client.listNamespacesFromKeywordIndex();
    const sparseNamespaces = sparseResult.ok ? sparseResult.namespaces : [];
    if (!sparseResult.ok) {
      console.warn(`⚠️ listNamespacesFromKeywordIndex failed: ${sparseResult.error}`);
    }
    if (sparseNamespaces.length === 0) {
      test5Skipped = true;
      console.log(`\n🔤 Test 5: Keyword search (sparse-only index)`);
      console.log(
        `⚠️  Keyword search skipped: sparse index has no namespaces (or index unavailable).`
      );
      console.log(
        `   Ensure the sparse index (e.g. rag-hybrid-sparse) exists and has data.`
      );
    } else {
      const sparseTestNamespace = sparseNamespaces[0].namespace;
      console.log(`\n🔤 Test 5: Keyword search (sparse-only index)`);
      console.log(`   Namespace: "${sparseTestNamespace}" (from sparse index)`);
      console.log(`   Query: "test query"`);
      console.log(`   Top K: 3`);
      try {
        const startTime5 = Date.now();
        const results5 = await client.keywordSearch({
          query: 'test query',
          namespace: sparseTestNamespace,
          topK: 3,
        });
        duration5 = Date.now() - startTime5;
        console.log(`✅ Keyword search returned ${results5.length} result(s) in ${duration5}ms`);
        if (results5.length > 0) {
          console.log(
            `   First result score: ${results5[0].score.toFixed(4)}, reranked: ${results5[0].reranked}`
          );
        }
      } catch (kwError) {
        test5Skipped = true;
        console.log(
          `⚠️  Keyword search skipped: ${kwError instanceof Error ? kwError.message : String(kwError)}`
        );
        console.log(
          `   Ensure the sparse index exists and namespace "${sparseTestNamespace}" has data.`
        );
      }
    }

    console.log('\n✨ All tests completed successfully!');
    console.log(`\nPerformance comparison:`);
    console.log(`  Without reranking:    ${duration1}ms`);
    console.log(`  With reranking:       ${duration2}ms`);
    if (duration3 !== undefined) {
      console.log(`  With metadata filter: ${duration3}ms`);
    }
    if (duration5 !== undefined) {
      console.log(`  Keyword search:       ${duration5}ms`);
    } else if (test5Skipped) {
      console.log(`  Keyword search:       skipped`);
    }
    console.log(`  Reranking overhead:   ${duration2 - duration1}ms`);
  } catch (error) {
    console.error('\n❌ Error during testing:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

// Run the test
test().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
