import React from 'react';
import { Box, Button, Grid, MenuItem, Select, TextField } from '@mui/material';
import { Data } from '../models';

export default function Models({
  onChange,
  dataInstance,
}: {
  onChange: (...args: any[]) => any;
  dataInstance: Data;
}) {
  const [source, setSource] = React.useState('');
  const [sourceForModel, setSourceForModel] = React.useState<string>();
  const [sourceForField, setSourceForField] = React.useState<string>();
  const [modelForField, setModelForField] = React.useState<string>();
  const [model, setModel] = React.useState('');
  const [field, setField] = React.useState('');
  const [dataType, setDataType] = React.useState<'string' | 'number'>('string');
  const [refresh, setRefresh] = React.useState(false);
  const [data] = React.useState(dataInstance);
  React.useEffect(() => {
    data.onChange = () => {
      onChange();
      setRefresh(!refresh);
    };
  }, [refresh]);
  return (
    <Box>
      <Box
        sx={{
          border: '1px black solid',
          borderRadius: '4px',
          padding: '8px',
          marginBlock: '4px',
        }}
      >
        <Box sx={{ textDecoration: 'underline' }}>Sources</Box>
        {[...data.sources.entries()].map(([k, s]) => {
          return (
            <Box key={k}>
              {k}
              <Button size="small" onClick={() => data.removeSource(k)}>
                x
              </Button>
            </Box>
          );
        })}
      </Box>
      <Box
        sx={{
          border: '1px black solid',
          borderRadius: '4px',
          padding: '8px',
          marginBlock: '4px',
        }}
      >
        <Box sx={{ textDecoration: 'underline' }}>Models</Box>
        {[...data.models.entries()].map(([k, m]) => {
          return (
            <Box sx={{display: 'flex', width: '100%'}}>
              <Box sx={{border: '1px black solid', borderRadius: '4px', padding: '8px', margin: '4px', flexGrow: 1}} key={k}>
                <Box>{k}</Box>
                {m.fields.map((f) => (
                  <Box>
                    {`${f.name} (${f.datatype}) (${[...data.sources.keys()].find(k => data.sources.get(k) === f.source)})`}
                    <Button size="small" onClick={() => data.removeField(f.name, k)}>x</Button>
                  </Box>
                ))}
              </Box>
              <Button size="small" onClick={() => data.removeModel(k)}>x</Button>
            </Box>
          );
        })}
      </Box>
      <Box>
        <TextField value={source} onChange={(e) => setSource(e.target.value)} />
        <Button
          onClick={() => {
            data.addSource(source);
            setSource('');
          }}
        >
          Add Source
        </Button>
      </Box>
      <Box>
        <TextField value={model} onChange={(e) => setModel(e.target.value)} />
        <Select
          value={sourceForModel}
          label="Source"
          onChange={(e) => setSourceForModel(e.target.value)}
        >
          {[...data.sources.keys()].map((k) => (
            <MenuItem value={k} key={k}>
              {k}
            </MenuItem>
          ))}
        </Select>
        <Button
          onClick={() => {
            data.addModel(model, sourceForModel);
            setModel('');
          }}
        >
          Add Model
        </Button>
      </Box>
      <Box>
        <TextField value={field} onChange={(e) => setField(e.target.value)} />
        <Select
          value={sourceForField}
          label="Source"
          onChange={(e) => setSourceForField(e.target.value)}
        >
          {[...data.sources.keys()].map((k) => (
            <MenuItem value={k} key={k}>
              {k}
            </MenuItem>
          ))}
        </Select>
        <Select
          value={modelForField}
          label="Model"
          onChange={(e) => setModelForField(e.target.value)}
        >
          {[...data.models.keys()].map((k) => (
            <MenuItem value={k} key={k}>
              {k}
            </MenuItem>
          ))}
        </Select>
        <Select
          value={dataType}
          label="Data Type"
          onChange={(e) => setDataType(e.target.value as 'string' | 'number')}
        >
          <MenuItem value="string">string</MenuItem>
          <MenuItem value="number">number</MenuItem>
        </Select>
        <Button
          onClick={() => {
            data.addField(field, dataType, modelForField, sourceForField);
            setField('');
            //setModelForField('');
            //setSourceForField('');
            //setDataType('string');
          }}
        >
          Add Field
        </Button>
      </Box>
    </Box>
  );
}
