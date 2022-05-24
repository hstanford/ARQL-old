import React from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { Data } from '../models';
import type { DataField, DataReference } from 'arql';
import Visualiser from './visualiser';

export default function Models({
  onChange = () => {},
  dataInstance,
}: {
  onChange?: (...args: any[]) => any;
  dataInstance: Data;
}) {
  const [source, setSource] = React.useState('');
  const [sourceForModel, setSourceForModel] = React.useState<string>();
  const [sourceForField, setSourceForField] = React.useState<string>();
  const [modelForField, setModelForField] = React.useState<string>();
  const [model, setModel] = React.useState('');
  const [field, setField] = React.useState('');
  const [dataType, setDataType] = React.useState<'string' | 'number'>('string');
  const [reference, setReference] = React.useState('');
  const [modelForReference, setModelForReference] = React.useState<string>();
  const [hasOne, setHasOne] = React.useState(false);
  const [otherModel, setOtherModel] = React.useState<string>();
  const [modelField, setModelField] = React.useState<string>();
  const [otherField, setOtherField] = React.useState<string>();
  const [refresh, setRefresh] = React.useState(false);
  const [data] = React.useState(dataInstance);
  const [models, setModels] = React.useState(dataInstance.models);
  React.useEffect(() => {
    data.onChange = () => {
      onChange();
      setModels(new Map([...dataInstance.models.entries()]));
      setRefresh(!refresh);
    };
  }, [refresh]);

  return <Visualiser models={models} data={dataInstance} />;
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
            <Box sx={{ display: 'flex', width: '100%' }}>
              <Box
                sx={{
                  border: '1px black solid',
                  borderRadius: '4px',
                  padding: '8px',
                  margin: '4px',
                  flexGrow: 1,
                }}
                key={k}
              >
                <Box>{k}</Box>
                {m.fields
                  .filter(function (f): f is DataField {
                    return f.type === 'datafield';
                  })
                  .map((f) => (
                    <Box>
                      {`${f.name} (${f.datatype}) (${[
                        ...data.sources.keys(),
                      ].find((k) => data.sources.get(k) === f.source)})`}
                      <Button
                        size="small"
                        onClick={() => data.removeField(f.name, k)}
                      >
                        x
                      </Button>
                    </Box>
                  ))}
                {m.fields
                  .filter(function (f): f is DataReference {
                    return f.type === 'datareference';
                  })
                  .map((f) => (
                    <Box>
                      {`${f.name} (${f.join(m.name, f.other.name)})`}
                      <Button
                        size="small"
                        onClick={() => data.removeField(f.name, k)}
                      >
                        x
                      </Button>
                    </Box>
                  ))}
              </Box>
              <Button size="small" onClick={() => data.removeModel(k)}>
                x
              </Button>
            </Box>
          );
        })}
      </Box>
      <Stack direction="row" spacing={1} sx={{ margin: '8px' }}>
        <TextField
          sx={{ flexGrow: 1 }}
          placeholder="Source Name"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <Button
          sx={{ width: '150px' }}
          variant="contained"
          onClick={() => {
            data.addSource(source);
            setSource('');
          }}
        >
          Add Source
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ margin: '8px' }}>
        <TextField
          sx={{ flexGrow: 1 }}
          placeholder="Model Name"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <FormControl>
          <InputLabel>Source</InputLabel>
          <Select
            sx={{ minWidth: '100px' }}
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
        </FormControl>
        <Button
          sx={{ width: '150px' }}
          variant="contained"
          onClick={() => {
            data.addModel(model, sourceForModel);
            setModel('');
          }}
        >
          Add Model
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ margin: '8px' }}>
        <TextField
          sx={{ flexGrow: 1 }}
          placeholder="Field Name"
          value={field}
          onChange={(e) => setField(e.target.value)}
        />
        <FormControl>
          <InputLabel>Source</InputLabel>
          <Select
            sx={{ minWidth: '100px' }}
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
        </FormControl>
        <FormControl>
          <InputLabel>Model</InputLabel>
          <Select
            sx={{ minWidth: '100px' }}
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
        </FormControl>
        <FormControl>
          <InputLabel>Data Type</InputLabel>
          <Select
            sx={{ minWidth: '100px' }}
            value={dataType}
            label="Data Type"
            onChange={(e) => setDataType(e.target.value as 'string' | 'number')}
          >
            <MenuItem value="string">string</MenuItem>
            <MenuItem value="number">number</MenuItem>
          </Select>
        </FormControl>
        <Button
          sx={{ width: '150px' }}
          variant="contained"
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
      </Stack>
      <Stack direction="row" spacing={1} sx={{ margin: '8px' }}>
        <TextField
          sx={{ flexGrow: 1 }}
          placeholder="Reference Name"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <FormControl>
          <InputLabel>Model</InputLabel>
          <Select
            sx={{ minWidth: '100px' }}
            value={modelForReference}
            label="Model"
            onChange={(e) => setModelForReference(e.target.value)}
          >
            {[...data.models.keys()].map((k) => (
              <MenuItem value={k} key={k}>
                {k}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel>Has One</InputLabel>
          <Checkbox
            onChange={(e) => setHasOne(e.target.checked)}
            checked={hasOne}
          />
        </FormControl>
        <FormControl>
          <InputLabel>Other Model</InputLabel>
          <Select
            sx={{ minWidth: '100px' }}
            value={otherModel}
            label="Model"
            onChange={(e) => setOtherModel(e.target.value)}
          >
            {[...data.models.keys()].map((k) => (
              <MenuItem value={k} key={k}>
                {k}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel>Model Field</InputLabel>
          <Select
            sx={{ minWidth: '100px' }}
            value={modelField}
            label="Model"
            onChange={(e) => setModelField(e.target.value)}
          >
            {(data.models.get(modelForReference)?.fields || [])
              .filter((field) => field.type === 'datafield')
              .map((field) => (
                <MenuItem value={field.name} key={field.name}>
                  {field.name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel>Other Field</InputLabel>
          <Select
            sx={{ minWidth: '100px' }}
            value={otherField}
            label="Model"
            onChange={(e) => setOtherField(e.target.value)}
          >
            {(data.models.get(otherModel)?.fields || [])
              .filter((field) => field.type === 'datafield')
              .map((field) => (
                <MenuItem value={field.name} key={field.name}>
                  {field.name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        <Button
          sx={{ width: '150px' }}
          variant="contained"
          onClick={() => {
            data.addRelation(
              reference,
              modelForReference,
              hasOne,
              otherModel,
              modelField,
              otherField
            );
            setReference('');
          }}
        >
          Add Field
        </Button>
      </Stack>
    </Box>
  );
}
