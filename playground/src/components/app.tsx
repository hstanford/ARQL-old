import React from 'react';
import { Box, Tabs, Tab } from '@mui/material';

import {
  buildParser,
  opResolver,
  contextualise,
  getOperatorLookup,
  delegator,
  Collector,
} from 'arql';

import dataInstance from '../models';
import { generic, native as nativeConfigurer } from '../configuration';

import Model from './models';
import Querier from './querier';

const { transforms, operators } = generic();
const opMap = getOperatorLookup(operators);

// declare this once for multiple parsings
const resolve = opResolver(opMap);

const parser = buildParser(resolve);

const collector = new Collector();
nativeConfigurer(collector);

export default function App() {
  const [page, setPage] = React.useState(0);
  const [content, setContent] = React.useState('');
  const [params, setParams] = React.useState<any[]>([]);
  return (
    <>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={page} onChange={(e, newValue) => setPage(newValue)} aria-label="app-tabs">
          <Tab label="Querier" />
          <Tab label="Models" />
        </Tabs>
      </Box>
      {page === 0 && <Querier {...{content, setContent, params, setParams}}/>}
      {page === 1 && <Model dataInstance={dataInstance}/>}
    </>
  );
}
