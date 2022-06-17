import {
  DataModel,
  isDataReference,
  DataField,
  DataReference,
} from '@arql/core';
import * as d3 from 'd3';
import React, { useEffect, useRef } from 'react';
import ForceGraph from '../forceGraph';
import { Box, Button, Dialog, Stack, Typography } from '@mui/material';
import DataObjectIcon from '@mui/icons-material/DataObject';
import { Add, Remove, Delete } from '@mui/icons-material';
import { Data } from '../../models';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Fields from './fields';
import Relationships from './relationships';
import Model from './model';
import SourceCreator from './sourceCreator';
import ModelCreator from './modelCreator';

interface Node {
  name: string;
  model: DataModel;
}
interface Link {
  source: string;
  target: string;
}

export default function Visualiser({
  models,
  data,
}: {
  data: Data;
  models: Map<string, DataModel>;
}) {
  const [openModel, setOpenModel] = React.useState(false);
  const [openSources, setOpenSources] = React.useState(false);
  const [openModelCreator, setOpenModelCreator] = React.useState(false);
  const [currentModel, setCurrentModel] = React.useState<DataModel>();
  const nodeHoverTooltip = React.useCallback((node) => {
    return `<div>${node.name}</div>`;
  }, []);

  const [showGraph, setShowGraph] = React.useState(true);

  const nodes = [...models.entries()].map(([name, model]) => ({
    name,
    model,
  }));

  const links = [...models.entries()].reduce<Link[]>((acc, [name, model]) => {
    for (let field of model.fields) {
      if (isDataReference(field) && models.has(field.other.name)) {
        acc.push({
          source: name,
          target: field.other.name,
        });
      }
    }
    return acc;
  }, []);

  const onClickNode = (node: Node) => {
    setCurrentModel(node.model);
    setOpenModel(true);
  };

  const refresh = React.useCallback(() => {
    setShowGraph(false);
    setTimeout(() => setShowGraph(true), 0);
  }, []);

  const name = currentModel?.name;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ position: 'absolute', zIndex: 1, right: '8px', margin: '8px' }}
      >
        <Button variant="outlined" onClick={() => setOpenSources(true)}>
          Add Source
        </Button>
        <Button variant="outlined" onClick={() => setOpenModelCreator(true)}>
          Add Model
        </Button>
      </Stack>
      {showGraph && (
        <ForceGraph
          linksData={links}
          nodesData={nodes}
          nodeHoverTooltip={nodeHoverTooltip}
          onClickNode={onClickNode}
        />
      )}
      {currentModel && (
        <Model
          model={currentModel}
          data={data}
          refresh={refresh}
          open={openModel}
          setOpen={setOpenModel}
        />
      )}
      <SourceCreator data={data} open={openSources} setOpen={setOpenSources} />
      <ModelCreator
        data={data}
        refresh={refresh}
        open={openModelCreator}
        setOpen={setOpenModelCreator}
      />
    </Box>
  );
}
